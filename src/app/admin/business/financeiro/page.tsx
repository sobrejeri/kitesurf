import { BarChart, Panel, PanelLink } from '@/components/admin/kit';
import { FinanceTabs, SettleBadge, DueBadge } from '@/components/business/finance-kit';
import { DemoBanner, PageHead, Stat } from '@/components/business/kit';
import { EmptyState } from '@/components/ui';
import { INSTRUCTORS } from '@/lib/business/demo';
import { entriesInScope, instructorBalance, instructorsWithLessons, periodSummary, receivableStatus, receivablesInScope } from '@/lib/business/finance';
import { dayLabel, parseScope, scopeQuery } from '@/lib/business/rules';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Financeiro' };

export default async function FinanceDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseScope(await searchParams);
  const q = scopeQuery(scope);
  const s = periodSummary(scope, 30);
  const week = Array.from({ length: 7 }, (_, i) => -6 + i).map((d) => ({ label: dayLabel(d).split(', ')[1] ?? '', value: entriesInScope(scope, 'revenue').filter((e) => e.dayOffset === d).reduce((t, e) => t + e.cents, 0) }));
  const owed = instructorsWithLessons(scope).map((id) => ({ id, b: instructorBalance(id) })).filter((r) => r.b.balanceCents > 0);
  const open = receivablesInScope(scope).filter((r) => receivableStatus(r) !== 'paid');
  return (
    <>
      <DemoBanner />
      <PageHead title="Financeiro" subtitle="Últimos 30 dias. A escola paga os instrutores por conta própria; aqui só se calcula e se registra." />
      <FinanceTabs active="/admin/business/financeiro" query={q} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Receitas" value={formatMoney(s.revenueCents)} /><Stat label="Despesas" value={formatMoney(s.expenseCents)} />
        <Stat label="Comissões devidas" value={formatMoney(s.commissionDueCents)} hint={`Pago ${formatMoney(s.commissionPaidCents)}`} /><Stat label="Resultado" value={formatMoney(s.resultCents)} hint="Receitas − despesas − comissões" />
      </div>
      <Panel title="Receitas por dia" action={<span className="text-[12px] text-muted">Últimos 7 dias</span>} className="mt-4"><BarChart points={week} describe={formatMoney} /></Panel>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Comissões a pagar" action={<PanelLink href={`/admin/business/financeiro/comissoes${q}`} label="Ver todas" />}>
          {owed.length === 0 ? <EmptyState>Nenhuma comissão pendente.</EmptyState> : <ul className="divide-y divide-line text-[13px]">{owed.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5"><span className="min-w-0"><strong className="block truncate text-ink">{INSTRUCTORS.find((i) => i.id === r.id)?.name}</strong><SettleBadge status={r.b.status} /></span><span className="tabular font-semibold text-ink">{formatMoney(r.b.balanceCents)}</span></li>))}</ul>}
        </Panel>
        <Panel title="Contas a receber em aberto" action={<PanelLink href={`/admin/business/financeiro/receber${q}`} label="Ver todas" />}>
          {open.length === 0 ? <EmptyState>Nada em aberto.</EmptyState> : <ul className="divide-y divide-line text-[13px]">{open.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5"><span className="min-w-0"><strong className="block truncate text-ink">{r.party}</strong><DueBadge status={receivableStatus(r)} /></span><span className="tabular font-semibold text-ink">{formatMoney(r.cents - r.receivedCents)}</span></li>))}</ul>}
        </Panel>
      </div>
    </>
  );
}
