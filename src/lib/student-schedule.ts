/** Shared interval rules; adjacent meetings are allowed, overlapping meetings are not. */
export interface StudentTimeSlot { startsAt: string; minutes: number }

export function slotsOverlap(a: StudentTimeSlot, b: StudentTimeSlot): boolean {
  const start = Date.parse(a.startsAt);
  const otherStart = Date.parse(b.startsAt);
  // Fail closed: an invalid or zero-length interval must never bypass the
  // client-side conflict guard. Server/database checks remain authoritative.
  if (!Number.isFinite(start) || !Number.isFinite(otherStart) ||
      !Number.isSafeInteger(a.minutes) || a.minutes <= 0 ||
      !Number.isSafeInteger(b.minutes) || b.minutes <= 0) return true;
  return start < otherStart + b.minutes * 60_000 && otherStart < start + a.minutes * 60_000;
}

export function hasScheduleConflict(proposed: readonly StudentTimeSlot[], occupied: readonly StudentTimeSlot[] = []): boolean {
  return proposed.some((slot, index) =>
    !Number.isFinite(Date.parse(slot.startsAt)) ||
    !Number.isSafeInteger(slot.minutes) || slot.minutes <= 0 ||
    proposed.some((other, j) => j > index && slotsOverlap(slot, other)) ||
    occupied.some((other) => slotsOverlap(slot, other)));
}

/** Shared minimum lead time for the form and the booking action. */
export function hasBookingLeadTime(startsAtMs: number, nowMs = Date.now()): boolean {
  return Number.isFinite(startsAtMs) && startsAtMs >= nowMs + 3_600_000;
}

/** Validate the exact purchased package before any instructor search RPC.
 * Accept integer hours only; never infer a missing/altered meeting from the UI.
 */
export function hasExactMeetingAllocation(hours: readonly number[], expectedHours?: number): boolean {
  if (hours.length < 1 || hours.length > 8 ||
      !hours.every((h) => Number.isSafeInteger(h) && h >= 1 && h <= 8)) return false;
  const total = hours.reduce((sum, h) => sum + h, 0);
  return total <= 8 && (expectedHours === undefined ||
    (Number.isSafeInteger(expectedHours) && expectedHours >= 1 && expectedHours <= 8 && total === expectedHours));
}
