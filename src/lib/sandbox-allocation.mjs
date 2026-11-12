/**
 * Sandbox-only VentoKite allocation arithmetic. No provider calls, transfers,
 * charges or persistence. Never use this as proof that MP 1:N is enabled.
 */
const MAX_CENTS = Number.MAX_SAFE_INTEGER;
function integer(value, label, max = MAX_CENTS) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new RangeError(`${label} must be a non-negative safe integer <= ${max}`);
  }
  return value;
}
function share(cents, basisPoints) {
  // BigInt avoids intermediate overflow and rounds half-up deterministically.
  return Number((BigInt(cents) * BigInt(basisPoints) + 5000n) / 10000n);
}
/**
 * @param {{grossCents:number,platformBps:number,affiliateBps?:number,
 * affiliateEligible?:boolean}} input
 * @returns {{grossCents:number,platformCents:number,affiliateCents:number,
 * instructorCents:number}}
 */
export function allocateSandboxBooking(input) {
  if (!input || typeof input !== 'object') throw new TypeError('allocation input required');
  const grossCents = integer(input.grossCents, 'grossCents');
  const platformBps = integer(input.platformBps, 'platformBps', 10000);
  const affiliateBps = integer(input.affiliateBps ?? 0, 'affiliateBps', 10000);
  if (platformBps + affiliateBps > 10000) throw new RangeError('combined commissions exceed 100%');
  if (!input.affiliateEligible && affiliateBps !== 0) throw new RangeError('ineligible affiliate cannot receive commission');
  const platformCents = share(grossCents, platformBps);
  const affiliateCents = input.affiliateEligible ? share(grossCents, affiliateBps) : 0;
  if (platformCents + affiliateCents > grossCents) {
    // Independent rounding may overshoot for tiny amounts; retain exact conservation.
    const cappedAffiliate = Math.min(affiliateCents, grossCents - platformCents);
    return { grossCents, platformCents, affiliateCents: cappedAffiliate,
      instructorCents: grossCents - platformCents - cappedAffiliate };
  }
  return { grossCents, platformCents, affiliateCents,
    instructorCents: grossCents - platformCents - affiliateCents };
}
