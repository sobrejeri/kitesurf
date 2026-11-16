import type { Booking } from './data';

/**
 * Operation indicators for the Admin, derived from bookings already loaded.
 * Money stays in integer cents and rates in basis points (10000 = 100%): the
 * figures are sums and ratios of each booking's frozen snapshot, nothing is
 * recomputed from prices. Validation (test) bookings never count.
 */
export interface PerformanceSummary {
  total: number;
  closed: number;
  cancelled: number;
  awaiting: number;
  confirmationBps: number;
  cancellationBps: number;
  volumeCents: number;
  averageTicketCents: number;
  meetingsDone: number;
  meetingsOpen: number;
  minutesDone: number;
  unassigned: number;
  perInstructor: { id: string; name: string; bookings: number; meetingsDone: number; minutesDone: number; netCents: number }[];
  perBeach: { name: string; bookings: number; volumeCents: number }[];
  perPartner: { id: string; bookings: number; commissionCents: number }[];
}

const ratioBps = (part: number, whole: number) => (whole > 0 ? Math.round((part * 10000) / whole) : 0);

export function summarizePerformance(all: readonly Booking[]): PerformanceSummary {
  const bookings = all.filter((b) => !b.is_test);
  const closedList = bookings.filter((b) => b.status === 'confirmed' || b.status === 'completed');
  const cancelled = bookings.filter((b) => b.status === 'cancelled').length;
  const awaiting = bookings.filter((b) => b.status === 'awaiting_payment').length;
  const volumeCents = closedList.reduce((sum, b) => sum + b.total_cents, 0);

  const meetings = bookings.filter((b) => b.status !== 'cancelled').flatMap((b) => b.booking_meetings);
  const meetingsDone = meetings.filter((m) => m.status === 'done').length;
  const meetingsOpen = meetings.filter((m) => m.status === 'scheduled' || m.status === 'in_progress').length;
  const minutesDone = meetings.filter((m) => m.status === 'done').reduce((sum, m) => sum + m.done_minutes, 0);

  const byInstructor = new Map<string, PerformanceSummary['perInstructor'][number]>();
  for (const b of closedList) {
    if (!b.instructor_id) continue;
    const row = byInstructor.get(b.instructor_id) ?? {
      id: b.instructor_id, name: b.instructor?.full_name || 'Instrutor', bookings: 0, meetingsDone: 0, minutesDone: 0, netCents: 0,
    };
    row.bookings += 1;
    row.netCents += b.instructor_net_cents;
    for (const m of b.booking_meetings) {
      if (m.status === 'done') { row.meetingsDone += 1; row.minutesDone += m.done_minutes; }
    }
    byInstructor.set(b.instructor_id, row);
  }

  const byBeach = new Map<string, PerformanceSummary['perBeach'][number]>();
  for (const b of closedList) {
    const name = b.beach?.name ?? 'Praia não informada';
    const row = byBeach.get(name) ?? { name, bookings: 0, volumeCents: 0 };
    row.bookings += 1;
    row.volumeCents += b.total_cents;
    byBeach.set(name, row);
  }

  const byPartner = new Map<string, PerformanceSummary['perPartner'][number]>();
  for (const b of closedList) {
    if (!b.partner_id) continue;
    const row = byPartner.get(b.partner_id) ?? { id: b.partner_id, bookings: 0, commissionCents: 0 };
    row.bookings += 1;
    row.commissionCents += b.partner_cents;
    byPartner.set(b.partner_id, row);
  }

  return {
    total: bookings.length,
    closed: closedList.length,
    cancelled,
    awaiting,
    confirmationBps: ratioBps(closedList.length, bookings.length),
    cancellationBps: ratioBps(cancelled, bookings.length),
    volumeCents,
    averageTicketCents: closedList.length > 0 ? Math.round(volumeCents / closedList.length) : 0,
    meetingsDone,
    meetingsOpen,
    minutesDone,
    unassigned: bookings.filter((b) => b.instructor_id === null && (b.status === 'confirmed' || b.status === 'awaiting_payment')).length,
    perInstructor: [...byInstructor.values()].sort((a, b) => b.minutesDone - a.minutesDone || b.bookings - a.bookings),
    perBeach: [...byBeach.values()].sort((a, b) => b.volumeCents - a.volumeCents),
    perPartner: [...byPartner.values()].sort((a, b) => b.bookings - a.bookings),
  };
}
