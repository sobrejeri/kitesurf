import { nextSandboxStatus, sandboxIdempotencyKey, type CheckoutStatus } from './checkout-sandbox.ts';

/** Pure sandbox-only reducer. No database, gateway calls or financial effects.
 * Production must authenticate provider signatures BEFORE invoking a reducer,
 * then atomically enforce unique event IDs + payment state under a DB lock. */
export interface SandboxPaymentState {
  status: CheckoutStatus;
  paymentId: string;
  processedEventKeys: readonly string[];
}
export interface SandboxPaymentEvent {
  provider: string;
  eventId: string;
  nextStatus: CheckoutStatus;
  paymentId: string;
}
export function applySandboxPaymentEvent(
  state: SandboxPaymentState,
  event: SandboxPaymentEvent,
): { state: SandboxPaymentState; applied: boolean } {
  if (!state.paymentId || event.paymentId !== state.paymentId) {
    throw new Error('Payment event does not belong to this payment');
  }
  const key = sandboxIdempotencyKey(event.provider, event.eventId);
  if (state.processedEventKeys.includes(key)) return { state, applied: false };
  // A distinct event that repeats the current state is safe but recorded.
  const status = nextSandboxStatus(state.status, event.nextStatus);
  return {
    state: { ...state, status, processedEventKeys: [...state.processedEventKeys, key] },
    applied: true,
  };
}
