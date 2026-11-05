import type { Booking, StudentBooking } from '@/lib/data';

/**
 * Paid minutes not yet delivered or scheduled: contracted − recorded − the
 * minutes already held by a scheduled or in-progress meeting. Mirrors the
 * server's booking_balance_minutes so the UI and the database never disagree.
 */
export function bookingBalanceMinutes(
  booking: Pick<Booking, 'total_hours' | 'booking_meetings'>,
): number {
  let done = 0;
  let scheduled = 0;
  for (const meeting of booking.booking_meetings) {
    if (meeting.status === 'done') done += meeting.done_minutes;
    else if (meeting.status === 'scheduled' || meeting.status === 'in_progress') scheduled += meeting.minutes;
  }
  return Math.max(0, booking.total_hours * 60 - done - scheduled);
}

/**
 * A finished booking stays in history; a later booking starts at 0 independently.
 * A confirmed booking whose meetings are all recorded but still holds a paid
 * balance is NOT finished — the student can reschedule a make-up for it.
 */
export function bookingIsFinished(
  booking: Pick<Booking, 'status' | 'total_hours' | 'booking_meetings'>,
): boolean {
  if (booking.status === 'completed') return true;
  return booking.status === 'confirmed' && booking.booking_meetings.length > 0
    && booking.booking_meetings.every((m) => m.status === 'done' || m.status === 'cancelled')
    && bookingBalanceMinutes(booking) === 0;
}
export function activeStudentBookings(bookings: readonly StudentBooking[]): StudentBooking[] {
  return bookings.filter((b) => b.status === 'confirmed' && !bookingIsFinished(b))
    .sort((a, b) => {
      const nextDate = (booking: StudentBooking) => booking.booking_meetings
        .filter((m) => m.status === 'scheduled' || m.status === 'in_progress')
        .map((m) => m.starts_at).sort()[0] ?? '9999';
      return nextDate(a).localeCompare(nextDate(b)) || b.created_at.localeCompare(a.created_at);
    });
}

/** Only completed meetings from the selected active booking advance its path. */
export function activeBookingStageMeetingIds(
  booking: Pick<Booking, 'booking_meetings'> | null,
): string[] {
  return booking?.booking_meetings
    .filter((meeting) => meeting.status === 'done')
    .map((meeting) => meeting.id) ?? [];
}

/**
 * Booking details are opt-in: visiting the Evolution tab alone never expands
 * an unfinished or completed class. The ID must belong to the student-scoped
 * list returned under RLS.
 */
export function selectedStudentBooking(
  bookings: readonly StudentBooking[],
  bookingId?: string,
): StudentBooking | null {
  if (!bookingId) return null;
  return bookings.find((booking) => booking.id === bookingId) ?? null;
}

/** Display the status of a booking rather than labeling all records as active. */
export function evolutionBookingStatus(
  booking: Pick<Booking, 'status' | 'total_hours' | 'booking_meetings'>,
) {
  if (booking.status === 'cancelled') return 'Cancelada';
  if (bookingIsFinished(booking)) return 'Concluída';
  if (booking.status === 'confirmed'
    && booking.booking_meetings.length > 0
    && booking.booking_meetings.every((m) => m.status === 'done' || m.status === 'cancelled')
    && bookingBalanceMinutes(booking) > 0) return 'Saldo a reagendar';
  if (booking.status === 'awaiting_payment') return 'Aguardando pagamento';
  if (booking.booking_meetings.some((meeting) => meeting.status === 'in_progress')) return 'Em aula';
  if (booking.booking_meetings.some((meeting) => meeting.status === 'done')) return 'Em andamento';
  return 'Confirmada';
}
