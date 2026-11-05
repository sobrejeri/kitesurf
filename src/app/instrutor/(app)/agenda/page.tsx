import type { Metadata } from 'next';
import Link from 'next/link';

import { blockInstructorTime, unblockInstructorTime } from '@/app/actions/availability';
import { respondBookingBalance } from '@/app/actions/booking-balance';
import { ActionForm } from '@/components/action-form';
import { ButtonLink, Card, Field, Note, PageHeader, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listBookingsForInstructor } from '@/lib/data';
import { formatDateLong, formatMinutes, formatTime } from '@/lib/format';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Agenda e bloqueios' };

type TimeOff = { id: string; starts_at: string; ends_at: string; reason: string };
type BalanceOffer = { id:string;booking_id:string;starts_at:string;minutes:number;expires_at:string };

export default async function InstructorAgendaPage() {
  const viewer = await requireRole(['instructor'], '/instrutor/agenda');
  const db = await createSupabaseServerClient();
  const [bookings, blocks, balanceOffers] = await Promise.all([
    listBookingsForInstructor(viewer.id),
    db.from('instructor_time_off').select('id,starts_at,ends_at,reason')
      .eq('instructor_id', viewer.id).gte('ends_at', new Date().toISOString())
      .order('starts_at', { ascending: true }).returns<TimeOff[]>(),
    db.from('booking_balance_requests')
      .select('id,booking_id,starts_at,minutes,expires_at')
      .eq('instructor_id', viewer.id).eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .returns<BalanceOffer[]>(),
  ]);
  const future = bookings.filter((b) => b.status === 'confirmed')
    .flatMap((b) => b.booking_meetings.filter(m => m.status === 'scheduled' || m.status === 'in_progress')
      .map(m => ({ ...m, code: b.code, beach: b.beach?.name ?? 'Praia', student: b.student?.full_name ?? 'Aluno', isTest: b.is_test })))
    .filter((m) => new Date(m.starts_at).getTime() + m.minutes * 60000 > Date.now())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return (
    <>
      <PageHeader title="Minha agenda" eyebrow="Programação real"
        lead="Consulte suas aulas confirmadas e bloqueie períodos em que não poderá atender."/>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-[18px] font-bold">Aulas agendadas</h2>
          {future.length === 0 ? <p className="mt-4 text-[13px] text-muted">Nenhuma aula confirmada para os próximos dias.</p> : (
            <ul className="mt-3 divide-y divide-line">
              {future.map(m => <li key={m.id} className="py-3 text-[13px]">
                <Link href={'/instrutor/aula?aba=' + (m.status === 'in_progress' ? 'andamento' : 'proximas') + '&aula=' + m.id + '#detalhes-aula'}
                  className="press flex items-center justify-between gap-3 rounded-[14px] p-2 hover:bg-brand-tint">
                  <span className="min-w-0">
                    <strong className="block text-ink">{formatDateLong(m.starts_at)} · {formatTime(m.starts_at)}</strong>
                    <span className="text-muted">{m.isTest ? '[AULA TESTE] · ' : ''}{m.student} · {m.beach} · {m.minutes / 60}h · {m.code}</span>
                  </span>
                  <span className="shrink-0 text-[12px] font-semibold text-brand">
                    {m.status === 'in_progress' ? 'Continuar ›' : 'Ver aula ›'}
                  </span>
                </Link>
              </li>)}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href="/instrutor/disponibilidade" variant="ghost">Configurar dias e turnos</ButtonLink>
            <ButtonLink href="/instrutor/pontos" variant="ghost">Definir pontos de encontro</ButtonLink>
          </div>
        </Card>
        <Card>
          <h2 className="text-[18px] font-bold">Bloquear um período</h2>
          {blocks.error ? (
            <Note tone="warning" className="mt-3">Execute a migração de disponibilidade para ativar os bloqueios reais.</Note>
          ) : (
            <>
              <ActionForm action={blockInstructorTime} submitLabel="Bloquear horário" className="mt-4 grid gap-3">
                <Field label="Início"><input type="datetime-local" name="start" required className={inputClass}/></Field>
                <Field label="Término"><input type="datetime-local" name="end" required className={inputClass}/></Field>
                <Field label="Motivo (opcional)"><input type="text" name="reason" maxLength={160} className={inputClass} placeholder="Ex.: folga ou manutenção"/></Field>
              </ActionForm>
              <h3 className="mt-5 text-[15px] font-semibold">Bloqueios ativos</h3>
              {(blocks.data ?? []).length === 0 ? <p className="mt-2 text-[13px] text-muted">Nenhum horário bloqueado.</p> : (
                <ul className="mt-2 divide-y divide-line">
                  {(blocks.data ?? []).map(x => (
                    <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <span className="text-[12px] text-muted">
                        <strong className="block text-ink">{formatDateLong(x.starts_at)} · {formatTime(x.starts_at)}</strong>
                        Até {formatDateLong(x.ends_at)} · {formatTime(x.ends_at)} {x.reason ? '· ' + x.reason : ''}
                      </span>
                      <ActionForm action={unblockInstructorTime} submitLabel="Remover" submitVariant="ghost" className="flex flex-wrap gap-2 items-center">
                        <input type="hidden" name="blockId" value={x.id}/>
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
      </div>
      {balanceOffers.error ? (
        <Note tone="warning" className="mt-4">
          A gestão de reposições ficará disponível após a migração 38 do banco.
        </Note>
      ) : (balanceOffers.data ?? []).length > 0 ? (
        <Card>
          <h2 className="text-[18px] font-bold text-ink">Solicitações de reposição</h2>
          <p className="mt-1 text-[13px] text-muted">
            Minutos que o aluno já contratou e ainda não realizou. Aceite apenas se puder atender;
            não será criado outro pagamento.
          </p>
          <ul className="mt-4 grid gap-3">
            {(balanceOffers.data ?? []).map((offer) => {
              const booking = bookings.find((item) => item.id === offer.booking_id);
              return (
                <li key={offer.id} className="rounded-[18px] border border-line bg-surface p-4">
                  <strong className="block text-[14px] text-ink">
                    {booking?.student?.full_name ?? 'Aluno'} · {booking?.code ?? 'Reserva'}
                  </strong>
                  <p className="mt-1 text-[13px] text-muted">
                    {formatDateLong(offer.starts_at)} · {formatTime(offer.starts_at)}
                    {' · '}{formatMinutes(offer.minutes)} de saldo
                  </p>
                  <p className="mt-1 text-[12px] text-muted">
                    Solicitação válida até {formatDateLong(offer.expires_at)}
                    {' · '}{formatTime(offer.expires_at)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionForm action={respondBookingBalance} submitLabel="Aceitar reposição"
                      className="flex items-center">
                      <input type="hidden" name="bookingId" value={offer.booking_id}/>
                      <input type="hidden" name="requestId" value={offer.id}/>
                      <input type="hidden" name="decision" value="accept"/>
                    </ActionForm>
                    <ActionForm action={respondBookingBalance} submitLabel="Recusar"
                      submitVariant="ghost" className="flex items-center">
                      <input type="hidden" name="bookingId" value={offer.booking_id}/>
                      <input type="hidden" name="requestId" value={offer.id}/>
                      <input type="hidden" name="decision" value="reject"/>
                    </ActionForm>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
