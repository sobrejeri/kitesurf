import type { Booking, StudentBooking } from '@/lib/data';

/** A finished booking stays in history; a later booking starts at 0 independently. */
export function bookingIsFinished(
  booking: Pick<Booking, 'status' | 'booking_meetings'>,
): boolean {
  return booking.status === 'completed'
    || (booking.status === 'confirmed' && booking.booking_meetings.length > 0
      && booking.booking_meetings.every((m) => m.status === 'done' || m.status === 'cancelled'));
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
  booking: Pick<Booking, 'status' | 'booking_meetings'>,
) {
  if (booking.status === 'cancelled') return 'Cancelada';
  if (bookingIsFinished(booking)) return 'Concluída';
  if (booking.status === 'awaiting_payment') return 'Aguardando pagamento';
  if (booking.booking_meetings.some((meeting) => meeting.status === 'in_progress')) return 'Em aula';
  if (booking.booking_meetings.some((meeting) => meeting.status === 'done')) return 'Em andamento';
  return 'Confirmada';
}
