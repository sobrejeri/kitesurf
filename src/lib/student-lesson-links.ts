export function lessonEvolutionHref(bookingId: string, meetingId: string): string {
  return `/aluno/evolucao?reserva=${encodeURIComponent(bookingId)}&encontro=${encodeURIComponent(meetingId)}#encontro-${encodeURIComponent(meetingId)}`;
}

export function lessonHasEvolution(status: string): boolean {
  return status === 'in_progress' || status === 'done';
}

export function lessonIsPast(status: string, startsAt: string, minutes: number, now: number): boolean {
  if (status === 'in_progress') return false;
  return status === 'done' || status === 'cancelled' || Date.parse(startsAt) + minutes * 60_000 < now;
}

/**
 * A scheduled encounter whose time has ended needs the instructor's record.
 * This is a display status only: never mark a lesson as completed by elapsed time.
 */
export function lessonNeedsInstructorRecord(status: string, startsAt: string, minutes: number, now: number): boolean {
  return status === 'scheduled' && lessonIsPast(status, startsAt, minutes, now);
}
