import 'server-only';

import { createSupabaseServerClient } from './supabase/server';
import type { StudentTimeSlot } from './student-schedule';

/** RLS and explicit ownership apply to both reads. No nested PostgREST relationships. */
export async function getStudentOccupiedSlots(studentId: string): Promise<StudentTimeSlot[]> {
  const db = await createSupabaseServerClient();
  const [bookings, requests] = await Promise.all([
    db.from('bookings').select('id,status,created_at').eq('student_id', studentId)
      .in('status', ['awaiting_payment', 'confirmed']),
    db.from('instructor_requests').select('meetings').eq('student_id', studentId)
      .eq('status', 'searching').gt('expires_at', new Date().toISOString())
      .returns<{ meetings: { starts_at: string; hours: number }[] }[]>(),
  ]);
  if (bookings.error || requests.error || !Array.isArray(bookings.data) || !Array.isArray(requests.data)) {
    const error = bookings.error ?? requests.error;
    console.error('[student.schedule]', { code: error?.code, message: error?.message });
    throw new Error('Não foi possível conferir sua agenda. Tente novamente antes de buscar instrutor.');
  }
  // A malformed JSON meetings payload must not be treated as an available slot.
  // Reject it explicitly instead of letting a .map() TypeError escape to the UI.
  if (requests.data.some((request) => !Array.isArray(request.meetings)
    || request.meetings.some((meeting) => !meeting
      || typeof meeting.starts_at !== 'string'
      || !Number.isSafeInteger(meeting.hours) || meeting.hours <= 0))) {
    console.error('[student.schedule.requests]', { code: 'INVALID_MEETINGS' });
    throw new Error('Não foi possível conferir sua agenda. Tente novamente antes de buscar instrutor.');
  }
  // Never drop an active payment hold because its creation timestamp is malformed.
  // Otherwise a corrupt row can incorrectly make an occupied slot appear free.
  if (bookings.data.some((booking) => booking.status === 'awaiting_payment'
    && (typeof booking.created_at !== 'string'
      || !Number.isFinite(Date.parse(booking.created_at))))) {
    console.error('[student.schedule.bookings]', { code: 'INVALID_CREATED_AT' });
    throw new Error('Não foi possível conferir sua agenda. Tente novamente antes de buscar instrutor.');
  }
  const ids = bookings.data.filter((booking) => booking.status === 'confirmed'
    || Date.parse(booking.created_at) >= Date.now() - 10 * 60_000).map((booking) => booking.id);
  const meetings = ids.length ? await db.from('booking_meetings')
    .select('starts_at,minutes').in('booking_id', ids)
    .in('status', ['scheduled', 'in_progress'])
    .returns<{ starts_at: string; minutes: number }[]>() : { data: [], error: null };
  if (meetings.error || !Array.isArray(meetings.data)) {
    console.error('[student.schedule.meetings]', { code: meetings.error?.code ?? 'NULL_RESULT' });
    throw new Error('Não foi possível conferir os encontros da sua agenda. Tente novamente.');
  }
  if (meetings.data.some((meeting) => !meeting
    || typeof meeting.starts_at !== 'string'
    || !Number.isSafeInteger(meeting.minutes) || meeting.minutes <= 0)) {
    console.error('[student.schedule.meetings]', { code: 'INVALID_MEETING_SLOT' });
    throw new Error('Não foi possível conferir os encontros da sua agenda. Tente novamente.');
  }
  return [
    ...(meetings.data ?? []).map((meeting) => ({ startsAt: meeting.starts_at, minutes: meeting.minutes })),
    ...(requests.data ?? []).flatMap((request) => request.meetings.map((meeting) =>
      ({ startsAt: meeting.starts_at, minutes: meeting.hours * 60 }))),
  ];
}
