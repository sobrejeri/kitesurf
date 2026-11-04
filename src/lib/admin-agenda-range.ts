export type AgendaView = 'day' | 'week' | 'month';
const DAY = 86_400_000;
const key = (stamp: number) => new Date(stamp).toISOString().slice(0, 10);

export function adminAgendaRange(date: string, view: AgendaView) {
  const stamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(stamp) || key(stamp) !== date) throw new Error('Data inválida.');
  let first = stamp;
  let last = stamp + DAY;
  if (view === 'week') {
    first -= new Date(stamp).getUTCDay() * DAY;
    last = first + 7 * DAY;
  } else if (view === 'month') {
    const d = new Date(stamp);
    first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    last = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  return {
    startsAt: `${key(first)}T00:00:00-03:00`,
    endsAt: `${key(last)}T00:00:00-03:00`,
    previousDate: key(stamp - DAY), nextDate: key(stamp + DAY),
  };
}
