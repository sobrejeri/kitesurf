import type { Metadata } from 'next';

import { MyLessons, type LessonCard } from '@/components/student/my-lessons';
import { KiteModelo3Header } from '@/components/student/modelo3-header';
import { requireRole } from '@/lib/auth';
import { BOOKING_STATUS_LABELS, MEETING_STATUS_LABELS, listBookingsForStudent } from '@/lib/data';
import { formatDateShort, formatDay, formatMinutes, formatMonthTag, formatTime } from '@/lib/format';
import { initials } from '@/lib/people';
import { lessonHasEvolution, lessonEvolutionHref, lessonIsPast } from '@/lib/student-lesson-links';
import { getStudentBookingInstructorAvatar } from '@/lib/student-booking-avatar';
import { VALIDATION_WITHOUT_CHECKOUT } from '@/lib/booking-mode';

export const metadata: Metadata = { title: 'Minhas aulas' };

export default async function MyLessonsPage({searchParams}:{searchParams:Promise<{aba?:string|string[]}>}) {
  const viewer = await requireRole(['student'], '/aluno/aulas');
  const initialTab=(await searchParams).aba==='anteriores'?1:0;
  const bookings = await listBookingsForStudent(viewer.id);
  const now = Date.now();

  // Real instructor photo per booking (one signed URL each), with initials fallback.
  const photoBookingIds = [...new Set(
    bookings.filter((b) => b.instructor_id && b.status !== 'cancelled').map((b) => b.id),
  )];
  const instructorPhotos = new Map(await Promise.all(
    photoBookingIds.map(async (id) => [id, await getStudentBookingInstructorAvatar(id)] as const),
  ));

  const lessons: LessonCard[] = bookings
    .filter((booking) => booking.status !== 'cancelled')
    .flatMap((booking) =>
      booking.booking_meetings.map((meeting) => {
        const past = lessonIsPast(meeting.status, meeting.starts_at, meeting.minutes, now);
        const awaiting = booking.status === 'awaiting_payment';
        return {
          bookingId: booking.id,
          meetingId: meeting.id,
          startsAt: meeting.starts_at,
          evolutionHref: lessonHasEvolution(meeting.status) ? lessonEvolutionHref(booking.id, meeting.id) : null,
          title: 'Aula particular de kitesurf',
          statusLabel: awaiting ? (VALIDATION_WITHOUT_CHECKOUT ? 'Aguardando sua confirmação' : BOOKING_STATUS_LABELS.awaiting_payment) : meeting.status === 'done' ? 'Concluída' : past && meeting.status==='scheduled' ? 'Aguardando registro' : MEETING_STATUS_LABELS[meeting.status],
          statusTone: awaiting || (past && meeting.status==='scheduled') ? 'warning' : meeting.status === 'done' ? 'quiet' : 'success',
          day: formatDay(meeting.starts_at),
          month: formatMonthTag(meeting.starts_at),
          beach: (booking.beach?.name ?? '—'),
          time: formatTime(meeting.starts_at),
          dateShort: formatDateShort(meeting.starts_at),
          durationLabel: formatMinutes(meeting.minutes),
          instructorName: booking.instructor?.full_name ?? 'Instrutor a confirmar',
          instructorInitials: initials(booking.instructor?.full_name),
          instructorPhotoUrl: instructorPhotos.get(booking.id) ?? null,
          past,
        } satisfies LessonCard;
      }),
    ).sort((a, b) => a.past === b.past
      ? (a.past ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt))
      : a.past ? 1 : -1);

  return (
    <div className="vento-student-desktop-lessons kite-modelo3 kite-modelo3--lessons">
      <KiteModelo3Header title="Minhas aulas" subtitle="Acompanhe suas aulas, detalhes e status." />
      <MyLessons key={initialTab} initialTab={initialTab} lessons={lessons} />
    </div>
  );
}
