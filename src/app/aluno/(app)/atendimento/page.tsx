import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/components/icon';
import { DesktopPageHeader } from '@/components/student/desktop-page-header';
import { StudentInstructorPhoto } from '@/components/student/instructor-photo';
import { StudentPageTitle } from '@/components/student/page-title';
import { requireRole } from '@/lib/auth';
import { listBookingsForStudent } from '@/lib/data';
import { formatRelativeStamp } from '@/lib/format';
import { getStudentBookingInstructorAvatar } from '@/lib/student-booking-avatar';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Minhas conversas' };

interface LastMessage { sender_id: string; body: string; created_at: string }

/**
 * Conversations as a messenger inbox: one row per confirmed booking with its
 * instructor's photo, the latest message and when it arrived. Each read runs
 * as the student, so RLS limits it to their own bookings.
 */
export default async function ConversationsPage() {
  const viewer = await requireRole(['student']);
  const bookings = await listBookingsForStudent(viewer.id);
  const conversations = bookings.filter(b => (b.status === 'confirmed' || b.status === 'completed') && b.instructor_id);
  const db = await createSupabaseServerClient();
  const rows = await Promise.all(conversations.map(async (booking) => {
    const [last, photo] = await Promise.all([
      db.from('booking_messages').select('sender_id,body,created_at').eq('booking_id', booking.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle<LastMessage>(),
      getStudentBookingInstructorAvatar(booking.id),
    ]);
    return { booking, last: last.error ? null : last.data, photo };
  }));
  // Most recent conversation first, like any messenger.
  rows.sort((a, b) => (b.last?.created_at ?? b.booking.created_at).localeCompare(a.last?.created_at ?? a.booking.created_at));
  const now = Date.now();

  return (
    <div className="vento-pc-secondary-page vento-pc-conversations-screen vento-mobile-appbar-clearance">
      <DesktopPageHeader eyebrow="ATENDIMENTO" title="Minhas conversas" lead="Fale com os instrutores das suas reservas confirmadas." icon="chat" backHref="/aluno/aulas" variant="lesson"/>
      <div className="vento-pc-secondary-main">
        <StudentPageTitle title="Conversas"
          subtitle={rows.length ? `${rows.length} ${rows.length === 1 ? 'conversa com seu instrutor' : 'conversas com seus instrutores'}` : 'Fale com seu instrutor após a confirmação'}/>
        {rows.length === 0 ? (
          <div className="rounded-card grid place-items-center gap-2 border border-dashed border-line-ghost bg-surface px-6 py-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand" aria-hidden="true"><Icon name="chat" className="!h-6 !w-6"/></span>
            <p className="text-[15px] font-semibold text-ink">Nenhuma conversa ainda</p>
            <p className="max-w-[30ch] text-[13px] text-muted">O chat com o instrutor é liberado quando a aula é confirmada.</p>
          </div>
        ) : (
          <ul aria-label="Conversas" className="vento-thread-list rounded-card overflow-hidden border border-line bg-surface shadow-card">
            {rows.map(({ booking, last, photo }) => {
              const name = booking.instructor?.full_name ?? 'Seu instrutor';
              const preview = last ? `${last.sender_id === viewer.id ? 'Você: ' : ''}${last.body}` : 'Nenhuma mensagem ainda. Diga olá!';
              return (
                <li key={booking.id} className="vento-thread-row border-b border-line last:border-b-0">
                  <Link href={`/aluno/atendimento/${booking.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-sand">
                    <StudentInstructorPhoto name={name} url={photo} size={48}/>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <strong className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{name}</strong>
                        {last ? <time dateTime={last.created_at} className="shrink-0 text-[11.5px] text-muted">{formatRelativeStamp(last.created_at, now)}</time> : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-label">{preview}</span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-muted">{booking.code} · {booking.beach?.name ?? 'Praia'}</span>
                    </span>
                    <Icon name="chevron" className="!h-4 !w-4 shrink-0 text-muted"/>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
