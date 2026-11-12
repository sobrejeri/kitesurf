/** Shared interval rules; adjacent meetings are allowed, overlapping meetings are not. */
export interface StudentTimeSlot { startsAt: string; minutes: number }

/** Require an explicit UTC offset to avoid interpreting a local wall-clock time
 * differently on the browser and the server (or during daylight changes).
 */
function parseAbsoluteSlotTime(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return Number.NaN;
  // Date.parse normalizes impossible calendar dates on some runtimes (e.g.
  // February 30). Validate the civil date before comparing UTC instants.
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  if (year < 100 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return Number.NaN;
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > maxDay) return Number.NaN;
  return Date.parse(value);
}

export function slotsOverlap(a: StudentTimeSlot, b: StudentTimeSlot): boolean {
  const start = parseAbsoluteSlotTime(a.startsAt);
  const otherStart = parseAbsoluteSlotTime(b.startsAt);
  // Fail closed: an invalid or zero-length interval must never bypass the
  // client-side conflict guard. Server/database checks remain authoritative.
  if (!Number.isFinite(start) || !Number.isFinite(otherStart) ||
      !Number.isSafeInteger(a.minutes) || a.minutes <= 0 ||
      !Number.isSafeInteger(b.minutes) || b.minutes <= 0) return true;
  return start < otherStart + b.minutes * 60_000 && otherStart < start + a.minutes * 60_000;
}

export function hasScheduleConflict(proposed: readonly StudentTimeSlot[], occupied: readonly StudentTimeSlot[] = []): boolean {
  return proposed.some((slot, index) =>
    !Number.isFinite(parseAbsoluteSlotTime(slot.startsAt)) ||
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
