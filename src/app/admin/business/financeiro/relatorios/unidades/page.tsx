import { periodFrom } from '@/components/business/finance-kit';
import { DataTable } from '@/components/business/kit';
import { ReportFrame } from '@/components/business/report-table';
import { byUnit } from '@/lib/business/finance';
import { parseScope, scopeQuery } from '@/lib/business/rules';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Relatório por unidade' };

export default async function UnitsReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const scope = parseScope(params); const days = periodFrom(params.dias);
  const q = scopeQuery(scope); const keep: Record<string, string> = Object.fromEntries(new URLSearchParams(q.slice(1)));
  return (
    <ReportFrame view="unidades" days={days} keep={keep} query={q} title="Relatório por unidade" subtitle={`Últimos ${days} dias. Mostra só as unidades do filtro.`}>
      <DataTable rows={byUnit(scope, days)} page={1} pageSize={10} hrefForPage={() => '#'} empty="Nenhuma unidade neste filtro."
        columns={[{ key: 'n', header: 'Unidade', cell: (u) => <span className="font-semibold">{u.name} <span className="font-normal text-muted">· {u.city}</span></span> }, { key: 'r', header: 'Receitas', cell: (u) => formatMoney(u.revenueCents), className: 'tabular' },
          { key: 'e', header: 'Despesas', cell: (u) => formatMoney(u.expenseCents), className: 'tabular' }, { key: 'c', header: 'Comissões', cell: (u) => formatMoney(u.commissionDueCents), className: 'tabular' }, { key: 'x', header: 'Resultado', cell: (u) => formatMoney(u.resultCents), className: 'tabular' }]} />
    </ReportFrame>
  );
}
