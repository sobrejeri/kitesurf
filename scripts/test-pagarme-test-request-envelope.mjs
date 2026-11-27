import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as crypto from 'node:crypto';
import * as contract from '../src/lib/pagarme-test-order.mjs';

const source = ts.transpileModule(readFileSync('src/lib/pagarme-test-request-envelope.mjs', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, allowJs: true },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(source, { module, exports: module.exports,
  require(id) { if (id === 'server-only') return {}; if (id === 'node:crypto') return crypto; if (id === './pagarme-test-order.mjs') return contract; throw Error(id); } });
const { prepareTestOrderEnvelope: prepare, matchesTestOrderEnvelope: matches } = module.exports;
const snapshot = { bookingId: '11111111-1111-4111-8111-111111111111', amountCents: 10000, customerId: 'cus_test', splits: [
  { recipientId: 'rp_first', cents: 2000, liable: true, chargeProcessingFee: true, chargeRemainderFee: true },
  { recipientId: 'rp_second', cents: 8000, liable: false, chargeProcessingFee: false, chargeRemainderFee: false },
] };
const input = { snapshot, method: { type: 'credit_card', cardId: 'card_test' }, secret: 'sk_test_SYNTHETIC', requestKey: '22222222-2222-4222-8222-222222222222' };
const original = prepare(input);
assert.equal(Object.isFrozen(original), true);
assert.equal(matches(original, prepare(structuredClone(input))), true);
assert.equal(JSON.stringify(original).includes(input.secret), false);
const reordered = Object.fromEntries(Object.entries(input).reverse());
reordered.snapshot = Object.fromEntries(Object.entries(snapshot).reverse());
reordered.snapshot.splits = snapshot.splits.map(item => Object.fromEntries(Object.entries(item).reverse()));
assert.equal(prepare(reordered).body, original.body, 'object key insertion order does not change the canonical body');
assert.equal(prepare(reordered).requestHash, original.requestHash);
for (const mutate of [
  value => { value.snapshot.amountCents = 10001; value.snapshot.splits[1].cents = 8001; },
  value => { value.snapshot.splits[1].recipientId = 'rp_other'; },
  value => { value.snapshot.splits[1].chargeProcessingFee = true; },
  value => { value.snapshot.splits[0].liable = false; },
  value => { value.method.cardId = 'card_other'; },
  value => { value.snapshot.customerId = 'cus_other'; },
  value => { value.requestKey = '33333333-3333-4333-8333-333333333333'; },
  value => { value.snapshot.splits.reverse(); },
]) {
  const altered = structuredClone(input); mutate(altered);
  assert.equal(matches(original, prepare(altered)), false);
}
assert.equal(matches({ ...original, body: original.body + ' ' }, original), false);
assert.equal(matches({ ...original, requestHash: '0'.repeat(64) }, original), false);
assert.equal(matches({ ...original, endpoint: 'https://example.invalid/orders' }, original), false);
assert.equal(matches(null, original), false);
assert.throws(() => prepare({ ...input, secret: 'sk_live_FORBIDDEN' }), /test key/);
assert.throws(() => prepare({ ...input, requestKey: 'bad' }), /request key/);
console.log('PASS: canonical test order envelope binds request key, payload, recipients, options and card ID without network');
