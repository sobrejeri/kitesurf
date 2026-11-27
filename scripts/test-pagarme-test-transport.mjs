import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as crypto from 'node:crypto';
import * as contract from '../src/lib/pagarme-test-order.mjs';

const load = (path, deps) => {
  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, allowJs: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, Buffer, AbortSignal,
    require(id) { if (id === 'server-only') return {}; if (id in deps) return deps[id]; throw Error(id); } });
  return module.exports;
};
const envelopes = load('src/lib/pagarme-test-request-envelope.mjs', { 'node:crypto': crypto, './pagarme-test-order.mjs': contract });
const { submitTestOrder: submit } = load('src/lib/pagarme-test-transport.mjs', { './pagarme-test-request-envelope.mjs': envelopes });
const snapshot = { bookingId: '11111111-1111-4111-8111-111111111111', amountCents: 10000, customerId: 'cus_test', splits: [
  { recipientId: 'rp_test', cents: 10000, liable: true, chargeProcessingFee: true, chargeRemainderFee: true },
] };
const requestKey = '22222222-2222-4222-8222-222222222222';
const secret = 'sk_test_SYNTHETIC';
const envelope = envelopes.prepareTestOrderEnvelope({ snapshot, method: { type: 'pix' }, secret, requestKey });
let calls = 0, sent;
const responseData = { id: 'or_test', code: snapshot.bookingId, amount: 10000, currency: 'BRL', customer: { id: 'cus_test' }, status: 'pending' };
const send = async (url, options) => { calls++; sent = { url, options }; return { ok: true, async json() { return responseData; } }; };
const result = await submit({ envelope, secret, send });
assert.equal(result.kind, 'observed'); assert.equal(result.orderId, 'or_test'); assert.equal(calls, 1);
assert.equal(sent.url, envelope.endpoint); assert.equal(sent.options.body, envelope.body, 'send the exact canonical persisted body');
assert.equal(sent.options.redirect, 'error'); assert.equal(sent.options.headers['Idempotency-Key'], envelope.requestKey);
assert.equal(sent.options.headers.Authorization, `Basic ${Buffer.from(`${secret}:`).toString('base64')}`);
assert.equal(JSON.stringify(result).includes(secret), false);
await assert.rejects(() => submit({ envelope, secret: 'sk_live_FORBIDDEN', send }), /test key/);
for (const change of [{ endpoint: 'https://example.invalid/orders' }, { body: envelope.body + ' ' },
  { requestHash: '0'.repeat(64) }, { requestKey: '33333333-3333-4333-8333-333333333333' }]) {
  await assert.rejects(() => submit({ envelope: { ...envelope, ...change }, secret, send }), /envelope/);
}
assert.equal(calls, 1, 'corruption must fail before transport');
// Changing a caller-owned envelope during I/O cannot change transmitted or expected data.
for (const useSentValues of [true, false]) {
  const mutable = { ...envelope };
  const output = await submit({ envelope: mutable, secret,
    send: async (_url, options) => {
      const body = JSON.parse(options.body);
      mutable.body = '{}'; mutable.requestKey = '33333333-3333-4333-8333-333333333333';
      await Promise.resolve();
      return { ok: true, async json() { return { ...responseData,
        code: useSentValues ? body.code : '33333333-3333-4333-8333-333333333333',
        amount: useSentValues ? body.items[0].amount : 1,
        customer: { id: useSentValues ? body.customer_id : 'cus_other' },
      }; } };
    } });
  assert.equal(output.kind, useSentValues ? 'observed' : 'unknown');
}
for (const failed of [async () => { throw Error('sensitive provider error'); }, async () => ({ ok: false }),
  async () => ({ ok: true, async json() { throw Error('malformed JSON'); } }),
  async () => ({ ok: true, async json() { return { id: 'or_wrong', amount: 1 }; } })]) {
  let attempts = 0;
  const output = await submit({ envelope, secret, send: async (...args) => { attempts++; return failed(...args); } });
  assert.equal(output.kind, 'unknown'); assert.equal(attempts, 1);
  assert.equal(JSON.stringify(output).includes('sensitive'), false);
}
console.log('PASS: test transport sends exact validated envelope, rejects tampering before I/O and binds responses without retry (mock network)');
