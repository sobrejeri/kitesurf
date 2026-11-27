import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as contract from '../src/lib/pagarme-test-order.mjs';

const source = ts.transpileModule(readFileSync('src/lib/pagarme-test-transport.mjs', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, allowJs: true },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(source, { module, exports: module.exports, Buffer, AbortSignal,
  require(id) { if (id === 'server-only') return {}; if (id === './pagarme-test-order.mjs') return contract; throw Error(id); } });
const submit = module.exports.submitTestOrder;
const snapshot = { bookingId: '11111111-1111-4111-8111-111111111111', amountCents: 10000, customerId: 'cus_test', splits: [
  { recipientId: 'rp_test', cents: 10000, liable: true, chargeProcessingFee: true, chargeRemainderFee: true },
] };
const requestKey = '22222222-2222-4222-8222-222222222222';
const secret = 'sk_test_SYNTHETIC';
let calls = 0, sent;
const send = async (url, options) => { calls++; sent = { url, options }; return { ok: true, async json() {
  return { id: 'or_test', code: snapshot.bookingId, amount: 10000, currency: 'BRL', customer: { id: 'cus_test' }, status: 'pending' };
} }; };
const result = await submit({ snapshot, method: { type: 'pix' }, secret, requestKey, send });
assert.equal(result.kind, 'observed'); assert.equal(result.orderId, 'or_test'); assert.equal(calls, 1);
assert.equal(sent.options.redirect, 'error'); assert.equal(sent.options.headers['Idempotency-Key'], requestKey);
assert.equal(sent.options.headers.Authorization, `Basic ${Buffer.from(`${secret}:`).toString('base64')}`);
assert.equal(JSON.stringify(result).includes(secret), false);
await assert.rejects(() => submit({ snapshot, method: { type: 'pix' }, secret: 'sk_live_FORBIDDEN', requestKey, send }), /test key/);
assert.equal(calls, 1);
for (const failed of [async () => { throw Error('sensitive provider error'); }, async () => ({ ok: false }),
  async () => ({ ok: true, async json() { throw Error('malformed JSON'); } }),
  async () => ({ ok: true, async json() { return { id: 'or_wrong', amount: 1 }; } })]) {
  let attempts = 0;
  const output = await submit({ snapshot, method: { type: 'pix' }, secret, requestKey,
    send: async (...args) => { attempts++; return failed(...args); } });
  assert.equal(output.kind, 'unknown'); assert.equal(attempts, 1);
  assert.equal(JSON.stringify(output).includes('sensitive'), false);
}
console.log('PASS: test transport key guard, fixed endpoint, idempotency header and uncertain outcomes without retry (mock network)');
