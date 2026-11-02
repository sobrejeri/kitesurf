import type { Booking, Meeting } from '@/lib/data';

export interface CompletedInstructorMeeting {
  booking: Booking;
  meeting: Meeting;
}

/** Caller must pass only the signed-in instructor's bookings (read under RLS). */
export function listCompletedInstructorMeetings(
  bookings: readonly Booking[],
): CompletedInstructorMeeting[] {
  return bookings.flatMap((booking) =>
    booking.booking_meetings
      .filter((meeting) => meeting.status === 'done')
      .map((meeting) => ({ booking, meeting })),
  ).sort((a, b) => b.meeting.starts_at.localeCompare(a.meeting.starts_at));
}

/** A deep link cannot open an encounter outside the instructor-scoped list. */
export function findCompletedInstructorMeeting(
  completed: readonly CompletedInstructorMeeting[],
  meetingId: string | undefined,
): CompletedInstructorMeeting | null {
  return meetingId ? completed.find(({ meeting }) => meeting.id === meetingId) ?? null : null;
}
