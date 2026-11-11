import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { sendBookingMessage } from '@/app/actions/chat';
import { ActionForm } from '@/components/action-form';
import { Icon } from '@/components/icon';
import { InstructorStudentPhoto } from '@/components/instructor/student-photo';
import { StudentInstructorPhoto } from '@/components/student/instructor-photo';
import { Note, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getBookingForViewer } from '@/lib/data';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { LiveConversation } from '@/components/live-conversation';
import { chatMessageExtras } from '@/lib/chat-message-extras';
import {chatWasRead, presenceLabel} from '@/lib/chat-dock';
import { ChatMessageExtras } from '@/components/chat-message-extras';
import { formatRelativeStamp, formatTime } from '@/lib/format';
import { getInstructorStudentAvatarUrls } from '@/lib/instructor-student-photos';
import { getStudentBookingInstructorAvatar } from '@/lib/student-booking-avatar';

interface ChatRow { id: string; sender_id: string; body: string; created_at: string }
type Area = 'aluno' | 'instrutor';

const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' });

/** "Hoje", "Ontem" or "4 de nov.", for the separators between days. */
function dayLabel(iso: string, now: number) {
  const stamp = formatRelativeStamp(iso, now);
  return stamp.startsWith('Hoje') || stamp === 'Agora' || stamp.startsWith('Há ') ? 'Hoje'
    : stamp.startsWith('Ontem') ? 'Ontem' : stamp;
}

/**
 * One booking's private conversation, laid out like a messenger: the other
 * person on top, bubbles grouped by day, and the composer at the bottom.
 * Used by the student and the instructor; each read is scoped to the viewer.
 */
export async function BookingChat({ bookingId, area, before }: { bookingId: string; area: Area; before?: { at?: string; id?: string } }) {
  const viewer = await requireRole([area === 'aluno' ? 'student' : 'instructor']);
  const booking = await getBookingForViewer(bookingId, viewer);
  if (!booking || (area === 'aluno' ? booking.student_id !== viewer.id : booking.instructor_id !== viewer.id)) {
    notFound();
  }
  const db = await createSupabaseServerClient();
  const cursor = z.object({ at: z.iso.datetime({ offset: true }), id: z.uuid() }).safeParse(before);
  let query = db.from('booking_messages')
    .select('id,sender_id,body,created_at').eq('booking_id', booking.id);
  if (cursor.success) query = query.or(`created_at.lt.${cursor.data.at},and(created_at.eq.${cursor.data.at},id.lt.${cursor.data.id})`);
  const { data: latest, error } = await query.order('created_at', { ascending: false })
    .order('id', { ascending: false }).limit(201).returns<ChatRow[]>();
  const hasOlder = (latest?.length ?? 0) > 200;
  const data = await chatMessageExtras(db,viewer.id,booking.id,(latest ?? []).slice(0, 200).reverse());
  const first = data[0];
  const last = data.at(-1);
  const allowed = booking.status === 'confirmed' || booking.status === 'completed';
  const peerId=area==='aluno'?booking.instructor_id:booking.student_id;
  const [peerReceipt,peerPresence,peerPhoto]=allowed && peerId?await Promise.all([
    db.from('booking_chat_reads').select('last_message_id,message_at,read_at').eq('booking_id',booking.id).eq('user_id',peerId).maybeSingle(),
    db.from('chat_presence').select('last_seen').eq('user_id',peerId).maybeSingle(),
    area==='aluno' ? getStudentBookingInstructorAvatar(booking.id)
      : getInstructorStudentAvatarUrls().then(urls=>urls.get(booking.student_id) ?? null),
  ]):[{data:null},{data:null},null];
  const title = area === 'aluno' ? (booking.instructor?.full_name || 'Seu instrutor') : (booking.student?.full_name || 'Seu aluno');
  const presence = presenceLabel(peerPresence.data?.last_seen ?? null);
  const online = presence === 'Online';
  const now = Date.now();
  const refreshHref = `/${area}/atendimento/${booking.id}`;
  return (
    <section aria-label={'Conversa com ' + title} className="vento-chat rounded-card max-w-3xl overflow-hidden border border-line bg-surface shadow-card">
      <header className="vento-chat-head flex items-center gap-3 border-b border-line px-4 py-3">
        {area === 'aluno'
          ? <StudentInstructorPhoto name={title} url={peerPhoto} size={44}/>
          : <InstructorStudentPhoto name={title} url={peerPhoto} size={44}/>}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[16px] font-semibold leading-tight text-ink">{title}</h2>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-[12px] text-muted">
            {online ? <span className="h-2 w-2 shrink-0 rounded-full bg-success" aria-hidden="true"/> : null}
            <span className="truncate">{presence === 'Status indisponível' ? `Reserva ${booking.code}` : `${presence} · ${booking.code}`}</span>
          </p>
        </div>
        {allowed && !error ? (
          <Link data-chat-navigation="page" href={refreshHref} aria-label="Atualizar mensagens" title="Atualizar mensagens"
            className="press grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:bg-sand hover:text-ink">
            <Icon name="refresh" className="!h-[18px] !w-[18px]"/>
          </Link>
        ) : null}
        <Link href={area === 'aluno' ? '/aluno/reserva/' + booking.id : '/instrutor/aula'}
          className="press inline-flex min-h-9 shrink-0 items-center rounded-full border border-line-ghost px-3 text-[12.5px] font-semibold text-brand hover:bg-brand-wash">
          {area === 'aluno' ? 'Ver reserva' : 'Aulas'}
        </Link>
      </header>
      {error ? (
        <div className="p-4"><Note tone="warning">O chat ainda não está disponível. Verifique a migração SQL de mensagens.</Note></div>
      ) : !allowed ? (
        <div className="p-4"><Note tone="warning">A conversa é liberada após a confirmação da aula. Nenhuma mensagem foi enviada.</Note></div>
      ) : (
        <>
          <div className="vento-chat-log bg-sand/40 px-3 py-3 sm:px-4">
            {hasOlder && first ? (
              <Link href={`/${area}/atendimento/${booking.id}?antes=${encodeURIComponent(first.created_at)}&mensagem=${first.id}`}
                className="press mx-auto mb-3 flex w-fit items-center gap-1.5 rounded-full border border-line-ghost bg-surface px-3 py-1.5 text-[12px] font-semibold text-brand">
                <Icon name="clock" className="!h-3.5 !w-3.5"/> Mensagens anteriores
              </Link>
            ) : null}
            <LiveConversation lastMessageId={data.at(-1)?.id ?? ''} live={!cursor.success}
              receipt={last?{area,bookingId:booking.id,through:last.created_at}:undefined}>
            {data.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-muted">Conversa iniciada. Envie sua primeira mensagem.</p>
            ) : (
              <ol aria-label="Mensagens da reserva" className="grid gap-1.5 py-1">
                {data.map((message, index) => {
                  const own = message.sender_id === viewer.id;
                  const day = dayLabel(message.created_at, now);
                  const previous = data[index - 1];
                  const newDay = !previous || DAY_KEY.format(Date.parse(previous.created_at)) !== DAY_KEY.format(Date.parse(message.created_at));
                  return (
                    <li key={message.id} className={'grid ' + (own ? 'justify-items-end' : 'justify-items-start')}>
                      {newDay ? <span className="vento-chat-day my-2 justify-self-center rounded-full bg-surface px-3 py-1 text-[11px] font-semibold text-muted shadow-card">{day}</span> : null}
                      <div className={own
                        ? 'max-w-[82%] break-words whitespace-pre-wrap rounded-[18px] rounded-br-[6px] bg-brand px-3.5 py-2 text-[14px] leading-snug text-on-brand'
                        : 'max-w-[82%] break-words whitespace-pre-wrap rounded-[18px] rounded-bl-[6px] border border-line bg-sand px-3.5 py-2 text-[14px] leading-snug text-ink'}>
                        <span className="sr-only">{own ? 'Você: ' : title + ': '}</span>
                        {message.body}
                        <ChatMessageExtras message={message}/>
                        <time dateTime={message.created_at} className="mt-0.5 block text-right text-[10.5px] opacity-70">
                          {formatTime(message.created_at)}
                          {own?` · ${chatWasRead(message,peerReceipt.data)?'Visualizada':'Enviada'}`:''}
                        </time>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            </LiveConversation>
          </div>
          {cursor.success ? (
            <Link data-chat-navigation="page" href={refreshHref}
              className="press flex min-h-12 items-center justify-center gap-1.5 border-t border-line text-[13px] font-semibold text-brand">
              Voltar às mensagens recentes para responder <Icon name="arrow" className="!h-4 !w-4"/>
            </Link>
          ) : (
            <ActionForm action={sendBookingMessage} submitLabel="Enviar"
              className="vento-chat-composer grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 border-t border-line bg-surface p-3"
              submitClassName="!min-h-11 !px-5">
              <input type="hidden" name="bookingId" value={booking.id}/>
              <label htmlFor="booking-message" className="sr-only">Sua mensagem</label>
              <textarea id="booking-message" name="body" rows={1} required minLength={1} maxLength={2000}
                placeholder="Mensagem" className={inputClass + ' !h-auto min-h-11 resize-none rounded-[22px] py-2.5 leading-snug'}/>
            </ActionForm>
          )}
        </>
      )}
    </section>
  );
}
