/**
 * Visual and accessibility safeguards for the shared lesson progress meter.
 * Never allow NaN, negative or overflowing progress tracks even when a
 * network response or demo fixture has out-of-range values.
 */
function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function progressBarShares(
  donePercent: number,
  reservedPercent = 0,
): { done: number; reserved: number } {
  const done = clampPercent(donePercent);
  const reserved = Math.min(100 - done, clampPercent(reservedPercent));
  return { done, reserved };
}
