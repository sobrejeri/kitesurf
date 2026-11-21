import type { Booking, Meeting } from '@/lib/data';

export type LessonTab = 'proximas' | 'andamento' | 'concluidas';

export type InstructorLesson = { booking: Booking; meeting: Meeting };
export type LessonGroups = Record<LessonTab, InstructorLesson[]>;

export function groupInstructorLessons(bookings: readonly Booking[]): LessonGroups {
  const groups: LessonGroups = { proximas: [], andamento: [], concluidas: [] };
  for (const booking of bookings) {
    if (booking.status !== 'confirmed' && booking.status !== 'completed') continue;
    for (const meeting of booking.booking_meetings) {
      const group = meeting.status === 'scheduled' && booking.status === 'confirmed'
        ? 'proximas'
        : meeting.status === 'in_progress' && booking.status === 'confirmed'
          ? 'andamento'
          : meeting.status === 'done' ? 'concluidas' : null;
      if (group) groups[group].push({ booking, meeting });
    }
  }
  groups.proximas.sort((a, b) => Date.parse(a.meeting.starts_at) - Date.parse(b.meeting.starts_at));
  groups.andamento.sort((a, b) => Date.parse(a.meeting.starts_at) - Date.parse(b.meeting.starts_at));
  groups.concluidas.sort((a, b) => Date.parse(b.meeting.starts_at) - Date.parse(a.meeting.starts_at));
  return groups;
}

/** Past scheduled lessons remain accessible for recording. */
export function nextScheduledInstructorLesson(groups: LessonGroups, now: number) {
  return groups.proximas.find(({ meeting }) => Date.parse(meeting.starts_at) >= now);
}

export function resolveInstructorLessonTab(
  requested: string | undefined,
  selectedId: string | undefined,
  groups: LessonGroups,
): LessonTab {
  if (requested === 'proximas' || requested === 'andamento' || requested === 'concluidas') {
    return requested;
  }
  // Keep old ?aula=<id> links (from previously published versions) working.
  if (selectedId && groups.andamento.some(({ meeting }) => meeting.id === selectedId)) return 'andamento';
  if (selectedId && groups.proximas.some(({ meeting }) => meeting.id === selectedId)) return 'proximas';
  if (selectedId && groups.concluidas.some(({ meeting }) => meeting.id === selectedId)) return 'concluidas';
  return groups.andamento.length ? 'andamento' : 'proximas';
}

/** Only meeting IDs present in the signed-in instructor's bookings may be opened. */
export function selectInstructorLesson(
  groups: LessonGroups,
  tab: LessonTab,
  meetingId: string | undefined,
): InstructorLesson | null {
  return meetingId ? groups[tab].find(({ meeting }) => meeting.id === meetingId) ?? null : null;
}

export function mayStartInstructorLesson(
  entry: InstructorLesson,
  localToday: string,
  localDay: (date: string) => string,
  /** Se informado, vale a regra do banco (a partir de 24h antes do horário); sem ele, o dia do calendário (comportamento antigo). */
  nowMs?: number,
): boolean {
  const open = nowMs === undefined
    ? localDay(entry.meeting.starts_at) <= localToday
    : Date.parse(entry.meeting.starts_at) <= nowMs + 24 * 3_600_000;
  return entry.booking.status === 'confirmed'
    && entry.meeting.status === 'scheduled'
    && entry.meeting.interruption_state !== 'awaiting_resume'
    && open
    && entry.booking.booking_meetings.every((previous) =>
      previous.position >= entry.meeting.position || previous.status === 'done');
}
