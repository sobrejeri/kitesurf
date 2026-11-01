import Link from 'next/link';
import { notFound } from 'next/navigation';

import { sendBookingMessage } from '@/app/actions/chat';
import { ActionForm } from '@/components/action-form';
import { ButtonLink, Card, Note, PageHeader, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getBookingForViewer } from '@/lib/data';
import { createSupabaseServerClient } from '@/lib/supabase/server';

interface ChatRow { id: string; sender_id: string; body: string; created_at: string }
type Area = 'aluno' | 'instrutor';

export async function BookingChat({ bookingId, area }: { bookingId: string; area: Area }) {
  const viewer = await requireRole([area === 'aluno' ? 'student' : 'instructor']);
  const booking = await getBookingForViewer(bookingId, viewer);
  if (!booking || (area === 'aluno' ? booking.student_id !== viewer.id : booking.instructor_id !== viewer.id)) {
    notFound();
  }
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from('booking_messages')
    .select('id,sender_id,body,created_at').eq('booking_id', booking.id)
    .order('created_at', { ascending: true }).limit(200).returns<ChatRow[]>();
  const allowed = booking.status === 'confirmed' || booking.status === 'completed';
  const title = area === 'aluno' ? (booking.instructor?.full_name || 'Seu instrutor') : (booking.student?.full_name || 'Seu aluno');
  return (
    <>
      <PageHeader eyebrow={'Reserva ' + booking.code} title={'Conversa com ' + title}
        lead="Mensagens privadas entre aluno e instrutor, vinculadas a esta contratação."/>
      <Card className="max-w-3xl">
        {error ? (
          <Note tone="warning">O chat ainda não está disponível. Verifique a migração SQL de mensagens.</Note>
        ) : !allowed ? (
          <Note tone="warning">A conversa é liberada somente após a confirmação do pagamento. Nenhuma mensagem foi enviada.</Note>
        ) : (
          <>
            {(data ?? []).length === 0 ? (
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
                        <time dateTime={message.created_at} className="mt-2 block text-right text-[10px] opacity-70">
                          {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza', dateStyle: 'short', timeStyle: 'short' }).format(new Date(message.created_at))}
                        </time>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            <ActionForm action={sendBookingMessage} submitLabel="Enviar mensagem" className="mt-5 grid gap-3 border-t border-line pt-4">
              <input type="hidden" name="bookingId" value={booking.id}/>
              <label htmlFor="booking-message" className="text-[13px] font-semibold">Sua mensagem</label>
              <textarea id="booking-message" name="body" rows={3} required minLength={1} maxLength={2000}
                placeholder="Escreva sua mensagem..." className={inputClass}/>
            </ActionForm>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Link href={`/${area}/atendimento/${booking.id}`} className="text-[13px] text-brand underline">
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
