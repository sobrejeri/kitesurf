import type { Metadata } from 'next';

import { MyLessons, type LessonCard } from '@/components/student/my-lessons';
import { StudentHero } from '@/components/student/sunset';
import { ButtonLink } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { BOOKING_STATUS_LABELS, MEETING_STATUS_LABELS, listBookingsForStudent } from '@/lib/data';
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
          beach: (booking.beach?.name ?? '—'),
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
      <StudentHero
        image="lesson"
        eyebrow="Sua agenda de bons ventos"
        eyebrowIcon="sun"
        title="Minhas aulas"
        highlight="aulas"
        lead="Seu próximo encontro com o mar começa aqui."
        compact
      >
        <ButtonLink href="/aluno/reservar" icon="plus" trailingIcon="arrow" className="px-7">
          Nova aula
        </ButtonLink>
      </StudentHero>
      <MyLessons lessons={lessons} />
    </>
  );
}
