import assert from 'node:assert/strict';
import { buildTestOrder } from '../src/lib/pagarme-test-order.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const sample = { bookingId: id, customerId: 'cus_test1', amountCents: 45000, splits: [
  { recipientId: 'rp_platform', cents: 6750, liable: true, chargeProcessingFee: true, chargeRemainderFee: true },
  { recipientId: 'rp_instructor', cents: 38250, liable: false, chargeProcessingFee: false, chargeRemainderFee: false },
] };
for (const key of ['', 'sk_live_abc', 'sk_abc', 'pk_test_abc', 'sk_test_']) assert.throws(() => buildTestOrder(sample, { type: 'pix' }, key), /test key/);
const pix = buildTestOrder(sample, { type: 'pix' }, 'sk_test_ABC123');
assert.equal(pix.endpoint, 'https://api.pagar.me/core/v5/orders');
assert.equal(pix.payload.code, id); assert.equal(pix.payload.customer_id, 'cus_test1');
assert.equal(pix.payload.payments[0].pix.expires_in, 1800);
assert.equal(pix.payload.payments[0].split.reduce((sum, item) => sum + item.amount, 0), 45000);
assert.equal(JSON.stringify(pix).includes('sk_test_ABC123'), false);
const card = buildTestOrder(sample, { type: 'credit_card', cardId: 'card_test1' }, 'sk_test_ABC123');
assert.equal(card.payload.payments[0].credit_card.card_id, 'card_test1');
assert.equal(card.payload.payments[0].credit_card.installments, 1);
assert.deepEqual(card.payload.payments[0].split, pix.payload.payments[0].split);
assert.throws(() => buildTestOrder(sample, { type: 'credit_card', cardId: '4111111111111111' }, 'sk_test_ABC123'), /method/);
assert.throws(() => buildTestOrder(sample, { type: 'credit_card', cardId: 'card_test1', cvv: '123' }, 'sk_test_ABC123'), /method/);
assert.throws(() => buildTestOrder({ ...sample, amountCents: 45001 }, { type: 'pix' }, 'sk_test_ABC123'), /split total/);
assert.throws(() => buildTestOrder({ ...sample, splits: [sample.splits[0], sample.splits[0]] }, { type: 'pix' }, 'sk_test_ABC123'), /Invalid split/);
assert.throws(() => buildTestOrder({ ...sample, splits: [{ ...sample.splits[0], liable: undefined }] }, { type: 'pix' }, 'sk_test_ABC123'), /Invalid split/);
assert.throws(() => buildTestOrder({ ...sample, bookingId: 'bad' }, { type: 'pix' }, 'sk_test_ABC123'), /snapshot/);
console.log('PASS: test-only API orders for Pix/card, exact split and tokenized-card identifier (offline)');
