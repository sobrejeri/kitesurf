import { DueBadge, FinanceTabs } from '@/components/business/finance-kit';
import { DataTable, DemoBanner, PageHead, pageHref } from '@/components/business/kit';
import { payablesInScope, payableStatus } from '@/lib/business/finance';
import { dayLabel, parseScope, scopeQuery, unitName } from '@/lib/business/rules';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Contas a pagar' };

export default async function PayablePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const scope = parseScope(params);
  const page = Number(Array.isArray(params.pagina) ? params.pagina[0] : params.pagina) || 1;
  const keep: Record<string, string> = Object.fromEntries(new URLSearchParams(scopeQuery(scope).slice(1)));
  const rows = payablesInScope(scope).sort((a, b) => a.dueOffset - b.dueOffset);
  const open = rows.reduce((t, r) => t + (r.cents - r.paidCents), 0);
  return (
    <>
      <DemoBanner />
      <PageHead title="Contas a pagar" subtitle={`Em aberto: ${formatMoney(open)}`} />
      <FinanceTabs active="/admin/business/financeiro/pagar" query={scopeQuery(scope)} />
      <DataTable rows={rows} page={page} pageSize={8} hrefForPage={(p) => pageHref('/admin/business/financeiro/pagar', keep, p)} empty="Nada neste filtro."
        columns={[
          { key: 'p', header: 'Fornecedor', cell: (r) => <span className="font-semibold">{r.party}</span> }, { key: 'u', header: 'Unidade', cell: (r) => unitName(r.unitId) },
          { key: 'd', header: 'Vencimento', cell: (r) => dayLabel(r.dueOffset), className: 'tabular' }, { key: 'v', header: 'Valor', cell: (r) => formatMoney(r.cents), className: 'tabular' },
          { key: 'r', header: 'Pago', cell: (r) => formatMoney(r.paidCents), className: 'tabular' }, { key: 's', header: 'Em aberto', cell: (r) => formatMoney(r.cents - r.paidCents), className: 'tabular' },
          { key: 't', header: 'Situação', cell: (r) => <DueBadge status={payableStatus(r)} /> },
        ]} />
    </>
  );
}
