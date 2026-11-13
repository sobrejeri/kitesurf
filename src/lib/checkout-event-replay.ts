import { nextSandboxStatus, sandboxIdempotencyKey, type CheckoutStatus } from './checkout-sandbox';

/** Pure sandbox-only reducer. No database, gateway calls or financial effects.
 * Production must authenticate provider signatures BEFORE invoking a reducer,
 * then atomically enforce unique event IDs + payment state under a DB lock. */
export interface SandboxPaymentState {
  status: CheckoutStatus;
  processedEventKeys: readonly string[];
}
export interface SandboxPaymentEvent {
  provider: string;
  eventId: string;
  nextStatus: CheckoutStatus;
}
export function applySandboxPaymentEvent(
  state: SandboxPaymentState,
  event: SandboxPaymentEvent,
): { state: SandboxPaymentState; applied: boolean } {
  const key = sandboxIdempotencyKey(event.provider, event.eventId);
  if (state.processedEventKeys.includes(key)) return { state, applied: false };
  // A distinct event that repeats the current state is safe but recorded.
  const status = nextSandboxStatus(state.status, event.nextStatus);
  return {
    state: { status, processedEventKeys: [...state.processedEventKeys, key] },
    applied: true,
  };
}
