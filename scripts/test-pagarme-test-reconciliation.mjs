import assert from 'node:assert/strict';
import { newSandboxPayment } from '../src/lib/sandbox-payment-events.mjs';
import { reconcilePagarmeTestObservation } from '../src/lib/pagarme-test-reconciliation.mjs';

const attempt = { environment: 'test', bookingId: 'booking-1', linkId: 'pl_abc', amountCents: 45000,
  payment: newSandboxPayment({ paymentId: 'pl_abc', method: 'card' }) };
const event = { environment: 'test', bookingId: 'booking-1', linkId: 'pl_abc', amountCents: 45000,
  currency: 'BRL', eventId: 'evt-1', status: 'approved' };
for (const change of [{ bookingId: 'other' }, { linkId: 'pl_other' }, { amountCents: 1 }, { currency: 'USD' }]) {
  assert.throws(() => reconcilePagarmeTestObservation(attempt, { ...event, ...change }), /does not match/);
}
assert.throws(() => reconcilePagarmeTestObservation(attempt, { ...event, environment: 'live' }), /Test environment/);
assert.throws(() => reconcilePagarmeTestObservation({ ...attempt, environment: 'live' }, event), /Test environment/);
const paid = reconcilePagarmeTestObservation(attempt, event);
assert.equal(paid.payment.status, 'approved'); assert.equal(paid.payment.payoutStatus, 'not_started');
assert.deepEqual(reconcilePagarmeTestObservation(paid, event), paid);
assert.throws(() => reconcilePagarmeTestObservation(paid, { ...event, status: 'refunded' }), /identifier collision/);
assert.throws(() => reconcilePagarmeTestObservation(paid, { ...event, eventId: 'evt-2', status: 'declined' }), /invalid or stale/);
const refunded = reconcilePagarmeTestObservation(paid, { ...event, eventId: 'evt-3', status: 'refunded' });
assert.equal(refunded.payment.status, 'refunded'); assert.equal(refunded.payment.payoutStatus, 'not_started');
console.log('PASS: test-only payment observations bind booking, link, amount and currency without payouts');
