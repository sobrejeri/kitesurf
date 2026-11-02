import type { MeetingStatus } from '@/lib/data';

/**
 * Booking progress is based on completed encounters, not elapsed calendar time.
 * An encounter currently in progress is shown separately and does not advance
 * the completion percentage until the instructor records it as done.
 * Cancelled meetings are not part of the remaining lesson plan.
 */
export function getBookingProgress(meetings: readonly { status: MeetingStatus }[]) {
  const active = meetings.filter(({ status }) => status !== 'cancelled');
  const total = active.length;
  const completed = active.filter(({ status }) => status === 'done').length;
  const inProgress = active.filter(({ status }) => status === 'in_progress').length;
  const remaining = active.filter(({ status }) => status === 'scheduled').length;

  const percent = total ? Math.round((completed / total) * 100) : 0;
  const inProgressPercent = total
    ? Math.min(100 - percent, Math.round((inProgress / total) * 100))
    : 0;

  return { total, completed, inProgress, remaining, percent, inProgressPercent };
}
