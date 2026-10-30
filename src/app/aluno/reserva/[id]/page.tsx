import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { confirmTestPayment } from '@/app/actions/booking';
import { ActionForm } from '@/components/action-form';
import { Icon } from '@/components/icon';
import { StudentHero } from '@/components/student/sunset';
import { Avatar, Badge, ButtonLink, Card, Eyebrow, KeyValue, Note, ProgressBar } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { BEACH_LABELS, BOOKING_STATUS_LABELS, LEVEL_LABELS, MEETING_STATUS_LABELS, getBookingForViewer, learningBalance } from '@/lib/data';
import { formatDateLong, formatMinutes, formatMoney, formatTime } from '@/lib/format';
import { initials } from '@/lib/people';

export const metadata: Metadata = { title: 'Sua reserva' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireRole(['student'], `/aluno/reserva/${id}`);
  if (!UUID.test(id)) notFound();
  // Scoped to the viewer: someone else's booking id is a 404, not a page.
  const booking = await getBookingForViewer(id, viewer);
  if (!booking || booking.student_id !== viewer.id) notFound();

  const awaiting = booking.status === 'awaiting_payment';
  const balance = learningBalance([{ ...booking, status: awaiting ? 'confirmed' : booking.status }]);
  const donePercent = balance.contracted ? Math.round((balance.done / balance.contracted) * 100) : 0;
  const reservedPercent = balance.contracted ? Math.round((balance.scheduled / balance.contracted) * 100) : 0;
  const instructorName = booking.instructor?.full_name ?? 'Instrutor a confirmar';

  return (
    <>
      <StudentHero
        eyebrow="Seu próximo bordo"
        title={awaiting ? 'Falta só o pagamento.' : 'Sua aula está confirmada.'}
        highlight={awaiting ? 'pagamento.' : 'confirmada.'}
        lead={
          awaiting
            ? `${instructorName} está reservado para você. Confirme o pagamento para garantir a aula.`
            : 'Tudo organizado. Confira os detalhes e encontre seu instrutor.'
        }
        compact
        image="lesson"
      />

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="grid content-start gap-5">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[16px]">Aula particular de kitesurf</h2>
              <Badge tone={awaiting ? 'warning' : 'success'}>{BOOKING_STATUS_LABELS[booking.status]}</Badge>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Avatar initials={initials(booking.instructor?.full_name)} tone="a3" size={44} />
              <div className="flex-1">
                <p className="font-[550]">{instructorName}</p>
                <p className="text-[11px] text-muted">Seu instrutor · {booking.language}</p>
              </div>
            </div>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <KeyValue label="Praia" value={BEACH_LABELS[booking.beach]} icon="pin" />
              <KeyValue label="Seu momento" value={LEVEL_LABELS[booking.level]} icon="kite" />
              <KeyValue label="Total de horas" value={`${booking.total_hours}h`} icon="clock" />
              <KeyValue label="Equipamentos" value="Incluídos na sua aula" icon="shield" />
            </dl>
            <h3 className="mt-6 text-[14px]">Encontros</h3>
            <ul className="mt-3 grid gap-2">
              {booking.booking_meetings.map((meeting) => (
                <li key={meeting.id} className="flex items-center justify-between gap-3 rounded-search border border-line px-4 py-3 text-[12px]">
                  <span>
                    <strong className="block font-[550]">{formatDateLong(meeting.starts_at)} · {formatTime(meeting.starts_at)}</strong>
                    <span className="text-muted">{formatMinutes(meeting.minutes)}{meeting.status === 'done' ? ` · ${formatMinutes(meeting.done_minutes)} realizados` : ''}</span>
                  </span>
                  <Badge tone={meeting.status === 'done' ? 'quiet' : 'brand'}>{MEETING_STATUS_LABELS[meeting.status]}</Badge>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap gap-2">
              <ButtonLink href="/aluno/ocorrencias" variant="ghost" size="sm">Vento, cancelamento ou ausência</ButtonLink>
              <ButtonLink href="/aluno/politicas" variant="text" size="sm">Consultar regras</ButtonLink>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-[16px]">Seu saldo de aprendizado</h2>
              <span className="tabular font-[550]">{formatMinutes(balance.contracted)}</span>
            </div>
            <div className="mt-4">
              <ProgressBar donePercent={donePercent} reservedPercent={reservedPercent} />
            </div>
            <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted">
              <span>● {formatMinutes(balance.done)} realizadas</span>
              <span>● {formatMinutes(balance.scheduled)} agendadas</span>
              <span>○ {formatMinutes(balance.available)} disponíveis</span>
            </p>
            <Link href="/aluno/evolucao" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-[550] text-brand">
              <Icon name="arrow" className="!h-4 !w-4" /> Acompanhar minha evolução
            </Link>
          </Card>
        </div>

        <div className="grid content-start gap-5">
          {awaiting ? null : (
            <Card className="text-center">
              <Eyebrow>Na hora da aula</Eyebrow>
              <h2 className="mt-2 text-[16px]">Seu código de presença</h2>
              <p className="mt-1 text-[12px] text-muted">Mostre ao instrutor para iniciar o atendimento.</p>
              <p className="tabular mt-4 rounded-search border border-line bg-brand-tint py-5 text-[36px] font-semibold tracking-[4px] text-brand">
                {booking.presence_code}
              </p>
              <p className="mt-3 text-[11px] text-muted">Reserva {booking.code}</p>
            </Card>
          )}
          <Card>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-label">Pagamento</span>
              <Badge tone={awaiting ? 'warning' : 'success'}>{awaiting ? 'Pendente' : 'Confirmado'}</Badge>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-[13px] text-label">Total da reserva</span>
              <strong className="tabular text-[24px] font-semibold tracking-[-0.7px] text-brand">{formatMoney(booking.total_cents)}</strong>
            </div>
            <p className="tabular mt-1 text-right text-[11px] text-muted">
              {booking.total_hours}h × {formatMoney(booking.hourly_rate_cents)}/hora
            </p>
            {awaiting ? (
              <div className="mt-4 border-t border-line pt-4">
                <ActionForm action={confirmTestPayment} submitLabel="Confirmar pagamento de teste" className="grid gap-3" wideSubmit>
                  <input type="hidden" name="bookingId" value={booking.id} />
                </ActionForm>
                <Note tone="warning" className="mt-3">
                  Pagamento simulado: nenhuma cobrança é feita. A integração com o provedor de pagamento vem na próxima etapa.
                </Note>
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}
