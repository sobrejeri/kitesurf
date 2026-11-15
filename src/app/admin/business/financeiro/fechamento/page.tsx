import { FinanceTabs, PeriodNav, periodFrom } from '@/components/business/finance-kit';
import { DemoBanner, PageHead, Stat } from '@/components/business/kit';
import { Panel } from '@/components/admin/kit';
import { Note } from '@/components/ui';
import { periodSummary } from '@/lib/business/finance';
import { parseScope, scopeQuery } from '@/lib/business/rules';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Fechamento financeiro' };

export default async function FinancialClosingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const scope = parseScope(params); const days = periodFrom(params.dias);
  const keep: Record<string, string> = Object.fromEntries(new URLSearchParams(scopeQuery(scope).slice(1)));
  const s = periodSummary(scope, days);
  const lines: [string, number][] = [['Receitas', s.revenueCents], ['Despesas', -s.expenseCents], ['Comissões devidas aos instrutores', -s.commissionDueCents]];
  return (
    <>
      <DemoBanner />
      <PageHead title="Fechamento financeiro" subtitle={`Últimos ${days} dias, nas unidades do filtro.`} />
      <FinanceTabs active="/admin/business/financeiro/fechamento" query={scopeQuery(scope)} />
      <PeriodNav base="/admin/business/financeiro/fechamento" keep={keep} days={days} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Receitas" value={formatMoney(s.revenueCents)} /><Stat label="Despesas" value={formatMoney(s.expenseCents)} /><Stat label="Comissões devidas" value={formatMoney(s.commissionDueCents)} /><Stat label="Resultado" value={formatMoney(s.resultCents)} /></div>
      <Panel title="Como o resultado é calculado" className="mt-4">
        <dl className="divide-y divide-line text-[13px]">
          {lines.map(([k, v]) => <div key={k} className="flex justify-between gap-3 py-2"><dt className="text-muted">{k}</dt><dd className="tabular text-ink">{formatMoney(v)}</dd></div>)}
          <div className="flex justify-between gap-3 py-2 font-semibold"><dt>Resultado do período</dt><dd className="tabular">{formatMoney(s.resultCents)}</dd></div>
        </dl>
      </Panel>
      <Note className="mt-4" title="Comissões pagas">No período, a escola registrou {formatMoney(s.commissionPaidCents)} em pagamentos aos instrutores. Isso não altera o resultado, que usa o que foi devido.</Note>
    </>
  );
}
