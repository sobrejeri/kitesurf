export function lessonEvolutionHref(bookingId: string, meetingId: string): string {
  return `/aluno/evolucao?reserva=${encodeURIComponent(bookingId)}&encontro=${encodeURIComponent(meetingId)}#encontro-${encodeURIComponent(meetingId)}`;
}

export function lessonHasEvolution(status: string): boolean {
  return status === 'in_progress' || status === 'done';
}
