import { applySandboxPaymentEvent } from './sandbox-payment-events.mjs';

/**
 * Pure validation of a normalized, already verified provider observation.
 * This is not a webhook handler or proof of authenticity. The caller must
 * authenticate/reconcile with Pagar.me and persist the event and transition
 * atomically before changing any test-only booking state.
 */
export function reconcilePagarmeTestObservation(attempt, observation) {
  if (!attempt || attempt.environment !== 'test' || !observation || observation.environment !== 'test') {
    throw new Error('Test environment required');
  }
  if (typeof attempt.bookingId !== 'string' || typeof attempt.orderId !== 'string'
      || !Number.isSafeInteger(attempt.amountCents) || attempt.amountCents < 1
      || attempt.payment?.paymentId !== attempt.orderId
      || !['card', 'pix'].includes(attempt.payment?.method) || attempt.payment?.payoutStatus !== 'not_started') {
    throw new Error('Invalid test attempt');
  }
  if (observation.bookingId !== attempt.bookingId || observation.orderId !== attempt.orderId
      || observation.amountCents !== attempt.amountCents || observation.currency !== 'BRL') {
    throw new Error('Payment does not match the test attempt');
  }
  const events = attempt.events ?? [];
  if (!Array.isArray(events) || !Array.isArray(attempt.payment.seenEventIds)
      || events.length !== attempt.payment.seenEventIds.length
      || events.some((e, i) => e.eventId !== attempt.payment.seenEventIds[i])) throw new Error('Invalid test attempt');
  const previous = events.find((e) => e.eventId === observation.eventId);
  if (previous && previous.status !== observation.status) throw new Error('Event identifier collision');
  const payment = applySandboxPaymentEvent(attempt.payment, {
    eventId: observation.eventId, paymentId: observation.orderId, status: observation.status,
  });
  return { ...attempt, payment, events: previous ? [...events] : [...events, { eventId: observation.eventId, status: observation.status }] };
}
