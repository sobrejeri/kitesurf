/**
 * Pure sandbox-only payment event reducer. No PSP, database or money movement.
 * Event IDs must be verified/authenticated upstream before calling this reducer.
 * A paid charge never implies an instructor payout.
 */
const STATES = Object.freeze({
  pix: { pending: ['approved', 'expired'], approved: ['refunded'], expired: [], refunded: [] },
  card: { pending: ['approved', 'declined'], approved: ['refunded'], declined: [], refunded: [] },
});
function text(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) {
    throw new TypeError(`${label} must be a nonempty bounded string`);
  }
  return value;
}
export function newSandboxPayment({ paymentId, method }) {
  text(paymentId, 'paymentId');
  if (!Object.hasOwn(STATES, method)) throw new RangeError('unsupported sandbox method');
  return { paymentId, method, status: 'pending', seenEventIds: [], payoutStatus: 'not_started' };
}
export function applySandboxPaymentEvent(payment, event) {
  if (!payment || !event) throw new TypeError('payment and event required');
  const paymentId = text(event.paymentId, 'paymentId');
  const eventId = text(event.eventId, 'eventId');
  const status = text(event.status, 'status');
  if (paymentId !== payment.paymentId) throw new RangeError('cross-payment event rejected');
  const transitions = STATES[payment.method]?.[payment.status];
  if (!transitions || !Array.isArray(payment.seenEventIds) || payment.payoutStatus !== 'not_started') {
    throw new RangeError('invalid payment snapshot');
  }
  if (payment.seenEventIds.includes(eventId)) {
    if (payment.status !== status && !payment.seenEventIds.includes(eventId + ':' + status)) {
      // Duplicate events are ignored even if delivered after later state changes.
    }
    return { ...payment, seenEventIds: [...payment.seenEventIds] };
  }
  if (!transitions.includes(status)) throw new RangeError('invalid or stale payment transition');
  return { ...payment, status, seenEventIds: [...payment.seenEventIds, eventId] };
}
