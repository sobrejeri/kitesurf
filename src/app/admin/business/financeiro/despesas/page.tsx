import { FinanceTabs, PeriodNav, periodFrom } from '@/components/business/finance-kit';
import { DataTable, DemoBanner, PageHead, pageHref } from '@/components/business/kit';
import { entriesInScope } from '@/lib/business/finance';
import { dayLabel, parseScope, scopeQuery, unitName } from '@/lib/business/rules';
import { EMPLOYEES } from '@/lib/business/demo';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Despesas' };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const scope = parseScope(params); const days = periodFrom(params.dias);
  const page = Number(Array.isArray(params.pagina) ? params.pagina[0] : params.pagina) || 1;
  const keep: Record<string, string> = Object.fromEntries(new URLSearchParams(scopeQuery(scope).slice(1)));
  const rows = entriesInScope(scope, 'expense', days).sort((a, b) => b.dayOffset - a.dayOffset);
  const total = rows.reduce((t, r) => t + r.cents, 0);
  return (
    <>
      <DemoBanner />
      <PageHead title="Despesas" subtitle={`${rows.length} lançamento(s) · total ${formatMoney(total)}`} />
      <FinanceTabs active="/admin/business/financeiro/despesas" query={scopeQuery(scope)} />
      <PeriodNav base="/admin/business/financeiro/despesas" keep={keep} days={days} />
      <DataTable rows={rows} page={page} pageSize={8} hrefForPage={(p) => pageHref('/admin/business/financeiro/despesas', { ...keep, dias: String(days) }, p)} empty="Nenhum lançamento neste período e filtro."
        columns={[
          { key: 'd', header: 'Data', cell: (r) => dayLabel(r.dayOffset), className: 'tabular' }, { key: 'c', header: 'Categoria', cell: (r) => <span className="font-semibold">{r.category}</span> },
          { key: 'u', header: 'Unidade', cell: (r) => unitName(r.unitId) }, { key: 'n', header: 'Descrição', cell: (r) => r.note },
          { key: 'e', header: 'Registrado por', cell: (r) => EMPLOYEES.find((e) => e.id === r.employeeId)?.name ?? '—' }, { key: 'v', header: 'Valor', cell: (r) => formatMoney(r.cents), className: 'tabular' },
        ]} />
    </>
  );
}
