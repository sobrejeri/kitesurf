import type { Metadata } from 'next';

import { AdminTitle, BarChart, Metric, Panel } from '@/components/admin/kit';
import { BOOKING_STATUS } from '@/components/admin/labels';
import { Badge, EmptyState, Note } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listAllBookings } from '@/lib/data';
import { dayKey, lastDays } from '@/lib/dates';
import { formatBps, formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Financeiro' };

/** Sums of each paid booking's frozen split; nothing is recomputed here. */
export default async function AdminFinancePage() {
  await requireRole(['admin'], '/admin/financeiro');
  const paid = (await listAllBookings(500)).filter((b) => !b.is_test && (b.status === 'confirmed' || b.status === 'completed'));
  const sum = (pick: (b: (typeof paid)[number]) => number) => paid.reduce((total, b) => total + pick(b), 0);
  const volume = sum((b) => b.total_cents);
  const platform = sum((b) => b.platform_cents);
  const instructors = sum((b) => b.instructor_net_cents);
  const partners = sum((b) => b.partner_cents);
  // Share of the volume, in basis points, from integer sums.
  const share = (part: number) => (volume > 0 ? Math.round((part * 10000) / volume) : 0);

  const perDay = lastDays(7).map((day) => ({
    label: day.label.slice(0, 5),
    value: paid.filter((b) => dayKey(b.created_at) === day.key).reduce((total, b) => total + b.total_cents, 0),
  }));

  return (
    <>
      <AdminTitle title="Financeiro" subtitle="Valores de referência das reservas. Aulas de validação ficam fora dos totais." />
      <p className="mb-4 text-[12px] text-muted">Este resumo considera as últimas 500 reservas cadastradas, com totais apenas das confirmadas ou concluídas elegíveis.</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Volume confirmado" value={formatMoney(volume)} hint={`${paid.length} reservas confirmadas`} hintTone="success" icon="wallet" tone="green" />
        <Metric label="Parcela plataforma" value={formatMoney(platform)} hint={formatBps(share(platform))} hintTone="muted" icon="chart" tone="sky" />
        <Metric label="Líquido instrutores" value={formatMoney(instructors)} hint={formatBps(share(instructors))} hintTone="muted" icon="users" tone="blue" />
        <Metric label="Comissões de afiliados" value={formatMoney(partners)} hint={formatBps(share(partners))} hintTone="brand" icon="home" tone="slate" />
      </div>

      <Panel title="Valores por data da reserva" action={<span className="text-[12px] text-muted">Últimos 7 dias</span>} className="mt-4">
        <BarChart points={perDay} describe={formatMoney} />
      </Panel>

      <Panel title="Distribuição por reserva" className="mt-4">
        {paid.length === 0 ? (
          <EmptyState>Nenhuma reserva elegível para os totais. Aulas de validação não geram receita.</EmptyState>
        ) : (
          <ul className="grid gap-2">
            {paid.map((b) => (
              <li key={b.id} className="rounded-[14px] border border-line px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-semibold text-ink">#{b.code.replace('VNT-', '')} · {b.instructor?.full_name ?? '—'}</span>
                  <Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge>
                </div>
                <dl className="tabular mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-4">
                  <div><dt className="text-muted">Total</dt><dd className="font-semibold text-ink">{formatMoney(b.total_cents)}</dd></div>
                  <div><dt className="text-muted">Instrutor</dt><dd className="text-ink">{formatMoney(b.instructor_net_cents)}</dd></div>
                  <div><dt className="text-muted">Plataforma</dt><dd className="text-ink">{formatMoney(b.platform_cents)}</dd></div>
                  <div><dt className="text-muted">Afiliado</dt><dd className="text-ink">{formatMoney(b.partner_cents)}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Note tone="warning" className="mt-4">
        Taxas do provedor, reembolsos e repasses dependem da integração de pagamento.
      </Note>
    </>
  );
}
