import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Panel } from '@/components/admin/kit';
import { BOOKING_STATUS } from '@/components/admin/labels';
import { Icon, type IconName } from '@/components/icon';
import { Badge } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { LEVEL_LABELS, MEETING_STATUS_LABELS, getBookingForViewer } from '@/lib/data';
import { formatDateLong, formatMinutes, formatMoney, formatTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Reserva' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Row({ icon, label, value }: { icon: IconName; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
      <Icon name={icon} className="mt-0.5 !h-5 !w-5 shrink-0 text-label" />
      <div className="min-w-0 flex-1">
        <dt className="text-[12px] text-muted">{label}</dt>
        <dd className="mt-0.5 text-[14px] text-ink">{value}</dd>
      </div>
    </div>
  );
}

export default async function AdminBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireRole(['admin'], `/admin/reservas/${id}`);
  if (!UUID.test(id)) notFound();
  const booking = await getBookingForViewer(id, viewer);
  if (!booking) notFound();

  const status = BOOKING_STATUS[booking.status];
  const awaiting = booking.status === 'awaiting_payment';

  return (
    <>
      <Link href="/admin/reservas" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-label">
        <Icon name="back" className="!h-4 !w-4" /> Reservas
      </Link>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold leading-tight text-ink">Reserva #{booking.code.replace('VNT-', '')}</h1>
          <p className="mt-1 text-[13px] text-muted">
            Criada em {formatDateLong(booking.created_at)} às {formatTime(booking.created_at)}
          </p>
        </div>
        <span className="flex flex-wrap gap-2"><Badge tone={status.tone}>{status.label}</Badge>{booking.is_test ? <Badge tone="warning">AULA TESTE</Badge> : null}</span>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Dados da aula">
          <dl>
            <Row icon="user" label="Aluno" value={booking.student?.full_name || 'Aluno'} />
            <Row icon="kite" label="Tipo de aula" value={`Particular · ${LEVEL_LABELS[booking.level]} · ${booking.language}`} />
            <Row icon="clock" label="Duração" value={`${booking.total_hours} hora(s) em ${booking.booking_meetings.length} encontro(s)`} />
            <Row icon="pin" label="Praia" value={booking.beach?.name ?? '—'} />
            <Row icon="users" label="Instrutor" value={booking.instructor?.full_name ?? 'A definir'} />
          </dl>
        </Panel>

        <div className="grid content-start gap-4">
          <Panel title={booking.is_test ? 'Simulação — sem cobrança' : 'Pagamento'} action={<Badge tone={booking.is_test || awaiting ? 'warning' : 'success'}>{booking.is_test ? 'AULA TESTE' : awaiting ? 'Pendente' : 'Confirmado'}</Badge>}>
            <dl className="tabular grid gap-2.5 text-[14px]">
              <div className="flex justify-between"><dt className="text-label">Método</dt><dd className="text-ink">Pagamento de teste</dd></div>
              <div className="flex justify-between"><dt className="text-label">Aula ({booking.total_hours}h × {formatMoney(booking.hourly_rate_cents)})</dt><dd className="text-ink">{formatMoney(booking.total_cents - booking.transport_cents)}</dd></div>
              <div className="flex justify-between"><dt className="text-label">Transporte de apoio</dt><dd className="text-ink">{booking.with_transport ? formatMoney(booking.transport_cents) : 'Não'}</dd></div>
              <div className="flex justify-between border-t border-line pt-2.5"><dt className="font-semibold text-ink">Valor total</dt><dd className="text-[18px] font-bold text-brand">{formatMoney(booking.total_cents)}</dd></div>
            </dl>
          </Panel>

          <Panel title={booking.is_test ? 'Valores demonstrativos (sem repasse)' : 'Divisão do valor'}>
            <dl className="tabular grid gap-2.5 text-[14px]">
              <div className="flex justify-between"><dt className="text-label">Instrutor (líquido)</dt><dd className="text-ink">{formatMoney(booking.instructor_net_cents)}</dd></div>
              <div className="flex justify-between"><dt className="text-label">Plataforma</dt><dd className="text-ink">{formatMoney(booking.platform_cents)}</dd></div>
              <div className="flex justify-between"><dt className="text-label">Afiliado</dt><dd className="text-ink">{formatMoney(booking.partner_cents)}</dd></div>
            </dl>
            <p className="mt-3 text-[12px] text-muted">{booking.is_test ? 'Valores apenas ilustrativos: não houve pagamento e não há comissão ou repasse.' : 'Fixada no momento da reserva; mudanças de preço não alteram este valor.'}</p>
          </Panel>
        </div>

        <Panel title="Encontros" className="lg:col-span-2">
          <ul className="grid gap-2">
            {booking.booking_meetings.map((meeting) => (
              <li key={meeting.id} className="flex items-center justify-between gap-3 rounded-[14px] border border-line px-4 py-3">
                <span>
                  <strong className="block text-[14px] font-semibold text-ink">
                    {formatDateLong(meeting.starts_at)} · {formatTime(meeting.starts_at)}
                  </strong>
                  <span className="text-[12px] text-muted">
                    {formatMinutes(meeting.minutes)}
                    {meeting.status === 'done' ? ` · ${formatMinutes(meeting.done_minutes)} realizados` : ''}
                  </span>
                  {meeting.note ? <span className="mt-1 block text-[12px] text-label">{meeting.note}</span> : null}
                </span>
                <Badge tone={meeting.status === 'done' ? 'quiet' : 'brand'}>{MEETING_STATUS_LABELS[meeting.status]}</Badge>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
