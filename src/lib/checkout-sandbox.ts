/** Offline checkout preparation contract. No gateway, database, or network side effects.
 * Never call this module to charge a card or release money. */
export type CheckoutMethod = 'pix' | 'card';
export type CheckoutStatus = 'created' | 'pending' | 'approved' | 'declined' | 'expired' | 'refunded' | 'chargeback';
export interface CheckoutQuote {
  bookingId: string;
  totalCents: number;
  platformFeeCents: number;
  instructorCents: number;
  partnerCents: number;
  currency: 'BRL';
}

function validCents(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/** Inputs must originate from trusted server-side prices and fee configuration.
 * Never accept these monetary inputs from a browser or a webhook payload. */
export function calculateSandboxQuote(
  bookingId: string, totalCents: number, platformBps: number, partnerBps = 0,
): CheckoutQuote {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bookingId)) throw new TypeError('Invalid booking ID');
  if (!validCents(totalCents) || totalCents === 0 ||
      !Number.isSafeInteger(platformBps) || platformBps < 0 || platformBps > 10000 ||
      !Number.isSafeInteger(partnerBps) || partnerBps < 0 || partnerBps > 10000 ||
      platformBps + partnerBps > 10000) throw new RangeError('Invalid sandbox pricing');
  // Bound inputs to avoid overflow before multiplication. Split rounding is deterministic.
  if (totalCents > Math.floor(Number.MAX_SAFE_INTEGER / 10000)) throw new RangeError('Amount too large');
  const platformFeeCents = Math.floor(totalCents * platformBps / 10000);
  const partnerCents = Math.floor(totalCents * partnerBps / 10000);
  return { bookingId, totalCents, platformFeeCents, partnerCents,
    instructorCents: totalCents - platformFeeCents - partnerCents, currency: 'BRL' };
}

export function nextSandboxStatus(current: CheckoutStatus, event: CheckoutStatus): CheckoutStatus {
  if (current === event) return current; // idempotent duplicate notification
  const transitions: Record<CheckoutStatus, readonly CheckoutStatus[]> = {
    created: ['pending', 'approved', 'declined', 'expired'],
    pending: ['approved', 'declined', 'expired'],
    approved: ['refunded', 'chargeback'],
    declined: [], expired: [], refunded: [], chargeback: [],
  };
  if (!transitions[current]?.includes(event)) throw new Error('Invalid payment state transition');
  return event;
}

/** Gateway notifications must be authenticated and deduplicated at the DB boundary.
 * This pure contract does not verify signatures or perform payouts. */
export function sandboxIdempotencyKey(provider: string, eventId: string): string {
  if (!/^[a-z][a-z0-9_-]{1,31}$/.test(provider) ||
      !/^[a-zA-Z0-9_-]{8,128}$/.test(eventId)) throw new TypeError('Invalid event identifier');
  return provider + ':' + eventId;
}
