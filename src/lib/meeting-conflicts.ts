/** Detect overlapping lessons by their real time interval (end exclusive).
 * Compare Ceará wall-clock values as UTC labels so timezone conversion cannot
 * shift a date while validating the dates/time the student typed.
 */
export interface MeetingSlot {
  date: string;
  start: string;
  hours: number;
}

function interval(slot: MeetingSlot): [number, number] {
  const start = Date.parse(`${slot.date}T${slot.start}:00Z`);
  return [start, start + slot.hours * 60 * 60 * 1000];
}

/** Return indices of the first pair that overlaps, including across midnight. */
export function findMeetingOverlap(slots: readonly MeetingSlot[]): [number, number] | null {
  for (let i = 0; i < slots.length; i++) {
    const first = slots[i];
    if (!first) continue;
    const [aStart, aEnd] = interval(first);
    if (!Number.isFinite(aStart) || !Number.isFinite(aEnd)) continue;
    for (let j = i + 1; j < slots.length; j++) {
      const second = slots[j];
      if (!second) continue;
      const [bStart, bEnd] = interval(second);
      if (Number.isFinite(bStart) && Number.isFinite(bEnd)
          && aStart < bEnd && bStart < aEnd) return [i, j];
    }
  }
  return null;
}

/** Preselect the following day rather than the same occupied time. */
export function nextMeetingDay(date: string): string {
  const day = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(day.getTime())) return date;
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}
