import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { sendBookingMessage } from '@/app/actions/chat';
import { ActionForm } from '@/components/action-form';
import { ButtonLink, Card, Note, PageHeader, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getBookingForViewer } from '@/lib/data';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { LiveConversation } from '@/components/live-conversation';
import { chatMessageExtras } from '@/lib/chat-message-extras';
import {chatWasRead, presenceLabel} from '@/lib/chat-dock';
import { ChatMessageExtras } from '@/components/chat-message-extras';

interface ChatRow { id: string; sender_id: string; body: string; created_at: string }
type Area = 'aluno' | 'instrutor';

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
  const [peerReceipt,peerPresence]=allowed && peerId?await Promise.all([
    db.from('booking_chat_reads').select('last_message_id,message_at,read_at').eq('booking_id',booking.id).eq('user_id',peerId).maybeSingle(),
    db.from('chat_presence').select('last_seen').eq('user_id',peerId).maybeSingle(),
  ]):[{data:null},{data:null}];
  const title = area === 'aluno' ? (booking.instructor?.full_name || 'Seu instrutor') : (booking.student?.full_name || 'Seu aluno');
  return (
    <>
      <PageHeader eyebrow={'Reserva ' + booking.code} title={'Conversa com ' + title}
        lead="Mensagens privadas entre aluno e instrutor, vinculadas a esta contratação."/>
      <Card className="max-w-3xl">
        {error ? (
          <Note tone="warning">O chat ainda não está disponível. Verifique a migração SQL de mensagens.</Note>
        ) : !allowed ? (
          <Note tone="warning">A conversa é liberada após a confirmação da aula. Nenhuma mensagem foi enviada.</Note>
        ) : (
          <>
            <p className="mb-4 text-xs text-label">{presenceLabel(peerPresence.data?.last_seen ?? null)}</p>
            <LiveConversation lastMessageId={data.at(-1)?.id ?? ''} live={!cursor.success}
              receipt={last?{area,bookingId:booking.id,through:last.created_at}:undefined}>
            {data.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-muted">Conversa iniciada. Envie sua primeira mensagem.</p>
            ) : (
              <ol aria-label="Mensagens da reserva" className="grid gap-3">
                {(data ?? []).map(message => {
                  const own = message.sender_id === viewer.id;
                  return (
                    <li key={message.id} className={own ? 'flex justify-end' : 'flex justify-start'}>
                      <div className={own
                        ? 'max-w-[85%] break-words whitespace-pre-wrap rounded-2xl bg-brand px-4 py-3 text-[13px] text-white'
                        : 'max-w-[85%] break-words whitespace-pre-wrap rounded-2xl border border-line bg-sand px-4 py-3 text-[13px] text-ink'}>
                        <span className="mb-1 block text-[11px] opacity-70">{own ? 'Você' : title}</span>
                        {message.body}
                        <ChatMessageExtras message={message}/>
                        <time dateTime={message.created_at} className="mt-2 block text-right text-[10px] opacity-70">
                          {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza', dateStyle: 'short', timeStyle: 'short' }).format(new Date(message.created_at))}
                          {own?` · ${chatWasRead(message,peerReceipt.data)?'Visualizada':'Enviada'}`:''}
                        </time>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            </LiveConversation>
            {hasOlder && first ? <Link href={`/${area}/atendimento/${booking.id}?antes=${encodeURIComponent(first.created_at)}&mensagem=${first.id}`}
              className="mt-4 inline-block text-[13px] text-brand underline">Mensagens anteriores</Link> : null}
            {cursor.success ? <Link data-chat-navigation="page" href={`/${area}/atendimento/${booking.id}`} className="mt-4 block text-[13px] text-brand underline">Voltar às mensagens recentes para responder</Link> : (
            <ActionForm action={sendBookingMessage} submitLabel="Enviar mensagem" className="mt-5 grid gap-3 border-t border-line pt-4">
              <input type="hidden" name="bookingId" value={booking.id}/>
              <label htmlFor="booking-message" className="text-[13px] font-semibold">Sua mensagem</label>
              <textarea id="booking-message" name="body" rows={3} required minLength={1} maxLength={2000}
                placeholder="Escreva sua mensagem..." className={inputClass}/>
            </ActionForm>
            )}
            {!cursor.success ? <p className="mt-2 text-[11px] text-muted">A conversa atualiza automaticamente enquanto estiver aberta.</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Link data-chat-navigation="page" href={`/${area}/atendimento/${booking.id}`} className="text-[13px] text-brand underline">
                Atualizar mensagens
              </Link>
              <ButtonLink href={area === 'aluno' ? '/aluno/reserva/' + booking.id : '/instrutor/aula'} size="sm" variant="ghost">
                {area === 'aluno' ? 'Ver reserva' : 'Minhas aulas'}
              </ButtonLink>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
