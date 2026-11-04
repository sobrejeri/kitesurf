/** Shared interval rules; adjacent meetings are allowed, overlapping meetings are not. */
export interface StudentTimeSlot { startsAt: string; minutes: number }

export function slotsOverlap(a: StudentTimeSlot, b: StudentTimeSlot): boolean {
  const start = Date.parse(a.startsAt);
  const otherStart = Date.parse(b.startsAt);
  return start < otherStart + b.minutes * 60_000 && otherStart < start + a.minutes * 60_000;
}

export function hasScheduleConflict(proposed: readonly StudentTimeSlot[], occupied: readonly StudentTimeSlot[] = []): boolean {
  return proposed.some((slot, index) =>
    proposed.some((other, j) => j > index && slotsOverlap(slot, other)) ||
    occupied.some((other) => slotsOverlap(slot, other)));
}
