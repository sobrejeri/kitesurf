import type { Metadata } from 'next';

import { AdminOverviewView } from '@/components/admin/overview-view';
import { requireRole } from '@/lib/auth';
import { listAllBookings, listAllInstructors } from '@/lib/data';
import { dayKey, lastDays } from '@/lib/dates';
import { formatWeekdayDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Visão geral' };

/**
 * Operation at a glance. Every money figure is a sum of bookings' frozen
 * snapshots, computed when each booking was created.
 */
export default async function OverviewPage() {
  await requireRole(['admin'], '/admin/visao');
  const [bookings, instructors] = await Promise.all([listAllBookings(500), listAllInstructors()]);

  const approved = instructors.filter((i) => i.status === 'approved').length;
  const pendingInstructors = instructors.filter((i) => i.status === 'pending').length;
  const actualBookings = bookings.filter((b) => !b.is_test);
  const paid = actualBookings.filter((b) => b.status === 'confirmed' || b.status === 'completed');
  const awaiting = actualBookings.filter((b) => b.status === 'awaiting_payment');
  const volume = paid.reduce((sum, b) => sum + b.total_cents, 0);
  const awaitingValue = awaiting.reduce((sum, b) => sum + b.total_cents, 0);
  const unassigned = actualBookings.filter((b) => b.instructor_id === null && (b.status === 'confirmed' || b.status === 'awaiting_payment'));

  const days = lastDays(7);
  const perDay = days.map((day) => ({
    label: day.label.slice(0, 5),
    value: actualBookings.filter((b) => dayKey(b.created_at) === day.key).length,
  }));

  // The next lessons of live bookings, soonest first.
  const upcoming = actualBookings
    .filter((b) => b.status === 'confirmed' || b.status === 'awaiting_payment')
    .flatMap((booking) => booking.booking_meetings
      .filter((meeting) => meeting.status === 'scheduled' || meeting.status === 'in_progress')
      .map((meeting) => ({ booking, meeting })))
    .sort((a, b) => a.meeting.starts_at.localeCompare(b.meeting.starts_at))
    .slice(0, 5);

  return (
    <AdminOverviewView
      todayLabel={formatWeekdayDate(new Date().toISOString())}
      approved={approved}
      pendingInstructors={pendingInstructors}
      bookingsCount={actualBookings.length}
      awaitingCount={awaiting.length}
      awaitingValue={awaitingValue}
      unassignedCount={unassigned.length}
      volume={volume}
      paidCount={paid.length}
      perDay={perDay}
      upcoming={upcoming}
    />
  );
}
