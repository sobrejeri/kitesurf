/**
 * Read-only case discovery. The overdue meeting monitor and the dispute
 * history are deliberately separate: finishing or cancelling a meeting must
 * not make a previously reported case disappear.
 *
 * All inputs MUST be read under the signed-in viewer's RLS. This helper never
 * fetches an unauthorized row or infers silence from an absent row.
 */
export type ProtectionCaseReference = {
  meetingId: string;
  createdAt: string;
};

const validId = (id: unknown): id is string =>
  typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/**
 * Monitor items are included first; the rest are recently filed reports.
 * An older reported case is still in the persistent database and must remain
 * reachable via future pagination/search work; this is only a bounded view.
 */
export function selectVisibleProtectionCaseIds(
  monitoredIds: readonly string[],
  reported: readonly ProtectionCaseReference[],
  limit = 120,
): string[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new RangeError('Invalid case page limit');
  }
  const recent = [...reported].filter(x => validId(x.meetingId))
    .sort((a, b) => {
      const aTime = Date.parse(a.createdAt);
      const bTime = Date.parse(b.createdAt);
      return (Number.isFinite(bTime) ? bTime : 0) -
        (Number.isFinite(aTime) ? aTime : 0);
    });
  const used = new Set<string>();
  const ids: string[] = [];
  for (const id of [...monitoredIds, ...recent.map(item => item.meetingId)]) {
    if (!validId(id) || used.has(id)) continue;
    used.add(id);
    ids.push(id);
    if (ids.length === limit) break;
  }
  return ids;
}

export function protectionCaseCanAcceptStatement(input: {
  area: 'aluno' | 'instrutor' | 'admin';
  viewerId: string;
  studentId: string | null;
  instructorId: string | null;
  bookingStatus: string | null;
  startsAt: string | null;
  minutes: number | null;
  nowMs: number;
}): boolean {
  if (input.area === 'admin' ||
      (input.area === 'aluno' && input.viewerId !== input.studentId) ||
      (input.area === 'instrutor' && input.viewerId !== input.instructorId)) return false;
  if (!['confirmed', 'completed'].includes(input.bookingStatus ?? '')) return false;
  if (!input.startsAt || !Number.isInteger(input.minutes) ||
      input.minutes === null || input.minutes < 1 || input.minutes > 480 ||
      !Number.isSafeInteger(input.nowMs)) return false;
  const startMs = Date.parse(input.startsAt);
  return Number.isSafeInteger(startMs) &&
    startMs + input.minutes * 60_000 <= input.nowMs;
}
