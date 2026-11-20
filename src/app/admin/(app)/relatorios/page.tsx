import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminTitle, BarChart, Metric, Panel } from '@/components/admin/kit';
import { BOOKING_STATUS } from '@/components/admin/labels';
import { Badge, EmptyState, Note } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { buildReport, parsePeriod, REPORT_PERIODS } from '@/lib/admin-report';
import { listAllBookings } from '@/lib/data';
import { formatBps, formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Relatórios' };

const LIMIT = 500;

/** Period report from the bookings' frozen snapshots; nothing is recomputed or charged here. */
export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  await requireRole(['admin'], '/admin/relatorios');
  const period = parsePeriod((await searchParams).periodo);
  const bookings = await listAllBookings(LIMIT);
  const report = buildReport(bookings, period);
  const truncated = bookings.length >= LIMIT;

  return (
    <>
      <AdminTitle title="Relatórios" subtitle={`Reservas dos últimos ${period} dias (sem aulas de teste)`} />
      <nav aria-label="Período" className="mb-4 flex flex-wrap gap-2">
        {REPORT_PERIODS.map((days) => (
          <Link key={days} href={`/admin/relatorios?periodo=${days}`} aria-current={days === period ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 text-[14px] font-semibold ${days === period ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-ink'}`}>
            {days} dias
          </Link>
        ))}
      </nav>
      {truncated ? <Note>Mostrando só as {LIMIT} reservas mais recentes; períodos longos podem estar incompletos.</Note> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Reservas no período" value={String(report.total)} icon="book" tone="blue" />
        <Metric label="Confirmadas e concluídas" value={String(report.paidCount)} icon="check" tone="green" />
        <Metric label="Volume" value={formatMoney(report.volumeCents)} hint={`Ticket médio ${formatMoney(report.averageTicketCents)}`} icon="wallet" tone="blue" />
        <Metric label="Cancelamentos" value={formatBps(report.cancellationBps)} hint={`${report.byStatus.cancelled} de ${report.total}`} icon="close" tone="orange" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Reservas por situação">
          <BarChart
            points={(Object.keys(BOOKING_STATUS) as (keyof typeof BOOKING_STATUS)[]).map((s) => ({ label: BOOKING_STATUS[s].label, value: report.byStatus[s] }))}
            describe={(v) => `${v} reservas`} />
        </Panel>
        <Panel title="Divisão do volume">
          <dl className="space-y-2 text-[14px]">
            <div className="flex justify-between"><dt className="text-muted">Plataforma</dt><dd className="tabular font-semibold">{formatMoney(report.platformCents)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Afiliados</dt><dd className="tabular font-semibold">{formatMoney(report.partnerCents)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Instrutores</dt><dd className="tabular font-semibold">{formatMoney(report.instructorCents)}</dd></div>
          </dl>
        </Panel>
        <Panel title="Por praia">
          {report.byBeach.length === 0 ? <EmptyState>Sem reservas no período.</EmptyState> : (
            <ul className="divide-y divide-line">
              {report.byBeach.map((b) => (
                <li key={b.name} className="flex items-center justify-between py-2 text-[14px]">
                  <span>{b.name} <Badge tone="quiet">{b.count}</Badge></span><span className="tabular font-semibold">{formatMoney(b.volumeCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Instrutores com mais reservas">
          {report.topInstructors.length === 0 ? <EmptyState>Sem instrutores no período.</EmptyState> : (
            <ol className="divide-y divide-line">
              {report.topInstructors.map((i) => (
                <li key={i.name} className="flex items-center justify-between py-2 text-[14px]"><span>{i.name}</span><span className="tabular font-semibold">{i.count}</span></li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </>
  );
}
