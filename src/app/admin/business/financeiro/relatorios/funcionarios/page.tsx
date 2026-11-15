import { periodFrom } from '@/components/business/finance-kit';
import { DataTable } from '@/components/business/kit';
import { ReportFrame } from '@/components/business/report-table';
import { byEmployee } from '@/lib/business/finance';
import { parseScope, scopeQuery } from '@/lib/business/rules';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Relatório por funcionário' };

export default async function EmployeesReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const scope = parseScope(params); const days = periodFrom(params.dias);
  const q = scopeQuery(scope); const keep: Record<string, string> = Object.fromEntries(new URLSearchParams(q.slice(1)));
  return (
    <ReportFrame view="funcionarios" days={days} keep={keep} query={q} title="Relatório por funcionário" subtitle={`Últimos ${days} dias: lançamentos registrados por cada pessoa nas unidades do filtro.`}>
      <DataTable rows={byEmployee(scope, days)} page={1} pageSize={10} hrefForPage={() => '#'} empty="Nenhum lançamento neste período e filtro."
        columns={[{ key: 'n', header: 'Funcionário', cell: (e) => <span className="font-semibold">{e.name}</span> }, { key: 'l', header: 'Lançamentos', cell: (e) => String(e.entries), className: 'tabular' }, { key: 'r', header: 'Receitas', cell: (e) => formatMoney(e.revenueCents), className: 'tabular' },
          { key: 'x', header: 'Despesas', cell: (e) => formatMoney(e.expenseCents), className: 'tabular' }, { key: 'c', header: 'Caixas operados', cell: (e) => String(e.registers), className: 'tabular' }]} />
    </ReportFrame>
  );
}
