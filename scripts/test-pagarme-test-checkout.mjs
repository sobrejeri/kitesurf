import assert from 'node:assert/strict';
import { createTestCheckoutRequest, parseTestCheckoutResponse } from '../src/lib/pagarme-test-checkout.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const snapshot = { bookingId: id, amountCents: 45000 };
for (const key of ['', 'sk_live_abc', 'sk_abc', 'pk_test_abc', 'sk_test_', 'sk_test_a:b']) {
  assert.throws(() => createTestCheckoutRequest(snapshot, key), /test key required/);
}
for (const bad of [null, {}, { bookingId: 'bad', amountCents: 1 }, { bookingId: id, amountCents: 0 },
  { bookingId: id, amountCents: 1.2 }, { bookingId: id, amountCents: 100000001 }]) {
  assert.throws(() => createTestCheckoutRequest(bad, 'sk_test_ABC123'), /Invalid booking snapshot/);
}
const request = createTestCheckoutRequest(snapshot, 'sk_test_ABC123');
assert.equal(request.endpoint, 'https://sdx-api.pagar.me/core/v5/paymentlinks');
assert.equal(JSON.stringify(request).includes('sk_test_ABC123'), false);
assert.equal(request.payload.order_code, id); assert.equal(request.payload.max_paid_sessions, 1);
assert.deepEqual(request.payload.payment_settings.accepted_payment_methods, ['credit_card']);
assert.equal(request.payload.payment_settings.credit_card_settings.installments[0].total, 45000);
assert.equal(request.payload.cart_settings.items[0].amount, 45000);
assert.deepEqual(parseTestCheckoutResponse({ id: 'pl_abc123', status: 'active', url: 'https://payment-link.pagar.me/pl_abc123' }),
  { id: 'pl_abc123', url: 'https://payment-link.pagar.me/pl_abc123' });
for (const url of ['http://payment-link.pagar.me/pl_abc123', 'https://payment-link.pagar.me.evil.test/pl_abc123',
  'https://evil.test/pl_abc123', 'https://payment-link.pagar.me/pl_other', 'https://payment-link.pagar.me/pl_abc123?x=1']) {
  assert.throws(() => parseTestCheckoutResponse({ id: 'pl_abc123', status: 'active', url }), /Invalid checkout response/);
}
assert.throws(() => parseTestCheckoutResponse({ id: 'pl_abc123', status: 'disabled', url: 'https://payment-link.pagar.me/pl_abc123' }), /Invalid checkout response/);
console.log('PASS: Pagar.me test-only checkout contract, amounts, correlation and safe response URL (no network)');
