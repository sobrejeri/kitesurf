import type { Metadata } from 'next';

import { InstructorTodayView } from '@/components/instructor/today-view';
import { requireRole } from '@/lib/auth';
import { getOwnInstructor, listBookingsForInstructor, listQueue } from '@/lib/data';
import { dayGreeting, formatWeekdayDate } from '@/lib/format';
import { groupInstructorLessons, instructorTodayLessons } from '@/lib/instructor-lesson-tabs';

export const metadata: Metadata = { title: 'Meu dia' };

export default async function InstructorTodayPage() {
  const viewer = await requireRole(['instructor'], '/instrutor/hoje');
  const [me, bookings, queue] = await Promise.all([
    getOwnInstructor(viewer.id),
    listBookingsForInstructor(viewer.id),
    listQueue(),
  ]);
  const position = queue.findIndex((row) => row.id === viewer.id) + 1;
  const confirmed = bookings.filter((booking) => booking.status === 'confirmed' || booking.status === 'completed');
  const nowMs = Date.now();
  const { upcoming, overdue } = instructorTodayLessons(groupInstructorLessons(bookings), nowMs);
  const doneMinutes = confirmed
    .flatMap((b) => b.booking_meetings)
    .reduce((sum, m) => sum + (m.status === 'done' ? m.done_minutes : 0), 0);
  // Each booking's frozen net, summed for display.
  const expectedNet = confirmed.filter((booking) => !booking.is_test)
    .reduce((sum, booking) => sum + booking.instructor_net_cents, 0);
  const now = new Date(nowMs).toISOString();

  return (
    <InstructorTodayView
      greeting={dayGreeting(now)}
      firstName={viewer.fullName.split(' ')[0] ?? ''}
      todayLabel={formatWeekdayDate(now)}
      status={me?.status}
      position={position}
      queueSize={queue.length}
      upcoming={upcoming}
      overdueCount={overdue.length}
      doneMinutes={doneMinutes}
      expectedNet={expectedNet}
    />
  );
}
