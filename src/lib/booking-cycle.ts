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
