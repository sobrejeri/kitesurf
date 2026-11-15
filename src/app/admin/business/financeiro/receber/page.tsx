import { DueBadge, FinanceTabs } from '@/components/business/finance-kit';
import { DataTable, DemoBanner, PageHead, pageHref } from '@/components/business/kit';
import { receivablesInScope, receivableStatus } from '@/lib/business/finance';
import { dayLabel, parseScope, scopeQuery, unitName } from '@/lib/business/rules';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Contas a receber' };

export default async function ReceivablePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const scope = parseScope(params);
  const page = Number(Array.isArray(params.pagina) ? params.pagina[0] : params.pagina) || 1;
  const keep: Record<string, string> = Object.fromEntries(new URLSearchParams(scopeQuery(scope).slice(1)));
  const rows = receivablesInScope(scope).sort((a, b) => a.dueOffset - b.dueOffset);
  const open = rows.reduce((t, r) => t + (r.cents - r.receivedCents), 0);
  return (
    <>
      <DemoBanner />
      <PageHead title="Contas a receber" subtitle={`Em aberto: ${formatMoney(open)}`} />
      <FinanceTabs active="/admin/business/financeiro/receber" query={scopeQuery(scope)} />
      <DataTable rows={rows} page={page} pageSize={8} hrefForPage={(p) => pageHref('/admin/business/financeiro/receber', keep, p)} empty="Nada neste filtro."
        columns={[
          { key: 'p', header: 'Cliente', cell: (r) => <span className="font-semibold">{r.party}</span> }, { key: 'u', header: 'Unidade', cell: (r) => unitName(r.unitId) },
          { key: 'd', header: 'Vencimento', cell: (r) => dayLabel(r.dueOffset), className: 'tabular' }, { key: 'v', header: 'Valor', cell: (r) => formatMoney(r.cents), className: 'tabular' },
          { key: 'r', header: 'Recebido', cell: (r) => formatMoney(r.receivedCents), className: 'tabular' }, { key: 's', header: 'Em aberto', cell: (r) => formatMoney(r.cents - r.receivedCents), className: 'tabular' },
          { key: 't', header: 'Situação', cell: (r) => <DueBadge status={receivableStatus(r)} /> },
        ]} />
    </>
  );
}
