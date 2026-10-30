import type { Metadata } from 'next';

import { MyLessons, type LessonCard } from '@/components/student/my-lessons';
import { ButtonLink, Eyebrow } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { BEACH_LABELS, BOOKING_STATUS_LABELS, MEETING_STATUS_LABELS, listBookingsForStudent } from '@/lib/data';
import { formatDateShort, formatDay, formatMinutes, formatMonthTag, formatTime } from '@/lib/format';
import { initials } from '@/lib/people';

export const metadata: Metadata = { title: 'Minhas aulas' };

export default async function MyLessonsPage() {
  const viewer = await requireRole(['student'], '/aluno/aulas');
  const bookings = await listBookingsForStudent(viewer.id);
  const now = Date.now();

  const lessons: LessonCard[] = bookings
    .filter((booking) => booking.status !== 'cancelled')
    .flatMap((booking) =>
      booking.booking_meetings.map((meeting) => {
        const past = meeting.status === 'done' || new Date(meeting.starts_at).getTime() + meeting.minutes * 60_000 < now;
        const awaiting = booking.status === 'awaiting_payment';
        return {
          bookingId: booking.id,
          title: 'Aula particular de kitesurf',
          statusLabel: awaiting ? BOOKING_STATUS_LABELS.awaiting_payment : MEETING_STATUS_LABELS[meeting.status],
          statusTone: awaiting ? 'warning' : meeting.status === 'done' ? 'quiet' : 'success',
          day: formatDay(meeting.starts_at),
          month: formatMonthTag(meeting.starts_at),
          beach: BEACH_LABELS[booking.beach],
          time: formatTime(meeting.starts_at),
          dateShort: formatDateShort(meeting.starts_at),
          durationLabel: formatMinutes(meeting.minutes),
          instructorName: booking.instructor?.full_name ?? 'Instrutor a confirmar',
          instructorInitials: initials(booking.instructor?.full_name),
          past,
        } satisfies LessonCard;
      }),
    );

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow icon="sun">Sua agenda de bons ventos</Eyebrow>
          <h1 className="mt-2 text-[28px] tracking-[-0.9px] sm:text-[32px]">Minhas aulas</h1>
          <p className="mt-1 text-[13px] text-muted">Seu próximo encontro com o mar começa aqui.</p>
        </div>
        <ButtonLink href="/aluno/reservar" icon="plus">Nova aula</ButtonLink>
      </header>
      <MyLessons lessons={lessons} />
    </>
  );
}
