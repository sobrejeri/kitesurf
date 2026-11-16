import type { Metadata } from 'next';

import { AdminTitle, BarChart, Metric, Panel } from '@/components/admin/kit';
import { EmptyState, Note } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listAllBookings, listAllPartners } from '@/lib/data';
import { dayKey, lastDays } from '@/lib/dates';
import { formatBps, formatMinutes, formatMoney } from '@/lib/format';
import { summarizePerformance } from '@/lib/performance';

export const metadata: Metadata = { title: 'Indicadores' };

/** How the operation is performing, from the frozen snapshots of the latest bookings. */
export default async function AdminIndicatorsPage() {
  await requireRole(['admin'], '/admin/indicadores');
  const [bookings, partners] = await Promise.all([listAllBookings(500), listAllPartners()]);
  const s = summarizePerformance(bookings);
  const partnerName = new Map(partners.map((p) => [p.id, p.name]));
  const perDay = lastDays(14).map((day) => ({
    label: day.label.slice(0, 5),
    value: bookings.filter((b) => !b.is_test && dayKey(b.created_at) === day.key).length,
  }));

  return (
    <>
      <AdminTitle title="Indicadores" subtitle="Desempenho das últimas 500 reservas. Aulas de validação ficam de fora." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Reservas confirmadas" value={`${s.closed} de ${s.total}`} hint={`${formatBps(s.confirmationBps)} das reservas`} hintTone="success" icon="check" tone="green" />
        <Metric label="Cancelamentos" value={String(s.cancelled)} hint={formatBps(s.cancellationBps)} icon="close" tone="slate" />
        <Metric label="Ticket médio" value={formatMoney(s.averageTicketCents)} hint={`Volume ${formatMoney(s.volumeCents)}`} icon="wallet" tone="blue" />
        <Metric label="Sem instrutor" value={String(s.unassigned)} hint={s.unassigned ? 'Precisa de distribuição' : 'Tudo atribuído'} hintTone={s.unassigned ? 'brand' : 'success'} icon="users" tone="sky" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Aulas realizadas" value={String(s.meetingsDone)} hint={formatMinutes(s.minutesDone)} icon="kite" tone="green" />
        <Metric label="Aulas a realizar" value={String(s.meetingsOpen)} hint="Agendadas ou em andamento" icon="calendar" tone="blue" />
        <Metric label="Aguardando pagamento" value={String(s.awaiting)} hint="Ainda sem confirmação" icon="clock" tone="sky" />
        <Metric label="Afiliados com vendas" value={String(s.perPartner.length)} hint="Reservas indicadas" icon="link" tone="slate" />
      </div>

      <Panel title="Novas reservas por dia" action={<span className="text-[12px] text-muted">Últimos 14 dias</span>} className="mt-4">
        <BarChart points={perDay} describe={(value) => `${value} reserva(s)`} />
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Instrutores">
          {s.perInstructor.length === 0 ? <EmptyState>Nenhuma reserva confirmada com instrutor ainda.</EmptyState> : (
            <ul className="divide-y divide-line">
              {s.perInstructor.slice(0, 8).map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                  <span className="min-w-0">
                    <strong className="block truncate text-ink">{row.name}</strong>
                    <span className="text-muted">{row.bookings} reserva(s) · {row.meetingsDone} aula(s) · {formatMinutes(row.minutesDone)}</span>
                  </span>
                  <span className="tabular shrink-0 font-semibold text-ink">{formatMoney(row.netCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="grid content-start gap-4">
          <Panel title="Praias">
            {s.perBeach.length === 0 ? <EmptyState>Sem reservas confirmadas.</EmptyState> : (
              <ul className="divide-y divide-line">
                {s.perBeach.map((row) => (
                  <li key={row.name} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                    <span className="min-w-0 truncate text-ink">{row.name} <span className="text-muted">· {row.bookings} reserva(s)</span></span>
                    <span className="tabular shrink-0 font-semibold text-ink">{formatMoney(row.volumeCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Afiliados">
            {s.perPartner.length === 0 ? <EmptyState>Nenhuma reserva veio de um link de afiliado.</EmptyState> : (
              <ul className="divide-y divide-line">
                {s.perPartner.slice(0, 6).map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                    <span className="min-w-0 truncate text-ink">{partnerName.get(row.id) ?? 'Afiliado'} <span className="text-muted">· {row.bookings} reserva(s)</span></span>
                    <span className="tabular shrink-0 font-semibold text-ink">{formatMoney(row.commissionCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
      <Note className="mt-4">Valores de referência das reservas; repasses e taxas do provedor dependem da integração de pagamento.</Note>
    </>
  );
}
