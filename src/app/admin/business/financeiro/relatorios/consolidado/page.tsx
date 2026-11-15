import { periodFrom } from '@/components/business/finance-kit';
import { Stat } from '@/components/business/kit';
import { ReportFrame } from '@/components/business/report-table';
import { Panel } from '@/components/admin/kit';
import { INSTRUCTORS } from '@/lib/business/demo';
import { instructorBalance, instructorsWithLessons, periodSummary } from '@/lib/business/finance';
import { parseScope, scopeQuery } from '@/lib/business/rules';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Relatório consolidado' };

export default async function ConsolidatedReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const scope = parseScope(params); const days = periodFrom(params.dias);
  const q = scopeQuery(scope); const keep: Record<string, string> = Object.fromEntries(new URLSearchParams(q.slice(1)));
  const s = periodSummary(scope, days);
  const owed = instructorsWithLessons(scope).reduce((t, id) => t + Math.max(0, instructorBalance(id).balanceCents), 0);
  return (
    <ReportFrame view="consolidado" days={days} keep={keep} query={q} title="Relatório consolidado da empresa" subtitle={`Últimos ${days} dias, nas unidades do filtro.`}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Receitas" value={formatMoney(s.revenueCents)} /><Stat label="Despesas" value={formatMoney(s.expenseCents)} /><Stat label="Resultado" value={formatMoney(s.resultCents)} /><Stat label="Comissões em aberto" value={formatMoney(owed)} hint={`${INSTRUCTORS.length} instrutores cadastrados`} /></div>
      <Panel title="Resumo do período" className="mt-4"><p className="text-[13px] text-label">Receitas de {formatMoney(s.revenueCents)}, despesas de {formatMoney(s.expenseCents)} e comissões devidas de {formatMoney(s.commissionDueCents)} resultam em {formatMoney(s.resultCents)}.</p></Panel>
    </ReportFrame>
  );
}
