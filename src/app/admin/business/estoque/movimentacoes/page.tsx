import Link from 'next/link';

import { DataTable, DemoBanner, PageHead, pageHref } from '@/components/business/kit';
import { StockTabs } from '@/components/business/stock-kit';
import { ButtonLink } from '@/components/ui';
import { PRODUCTS, STOCK_MOVEMENTS, type StockMovementType } from '@/lib/business/demo';
import { dayLabel, parseScope, scopeQuery, unitName } from '@/lib/business/rules';
import { stockUnits } from '@/lib/business/stock';

export const metadata = { title: 'Movimentações de estoque' };
const LABEL: Record<StockMovementType, string> = { in: 'Entrada', sale: 'Venda', adjust: 'Ajuste', transfer_out: 'Transferência (saída)', transfer_in: 'Transferência (entrada)' };
const FILTERS: { id: string; label: string }[] = [{ id: '', label: 'Todas' }, { id: 'in', label: 'Entradas' }, { id: 'sale', label: 'Vendas' }, { id: 'adjust', label: 'Ajustes' }, { id: 'transfer', label: 'Transferências' }];

export default async function StockMovementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const scope = parseScope(params); const q = scopeQuery(scope);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const tipo = FILTERS.some((f) => f.id === one(params.tipo)) ? one(params.tipo) : '';
  const page = Number(one(params.pagina)) || 1;
  const base: Record<string, string> = Object.fromEntries(new URLSearchParams(q.slice(1)));
  const ids = new Set(stockUnits(scope));
  const rows = [...STOCK_MOVEMENTS].filter((m) => ids.has(m.unitId) && (!tipo || m.type === tipo || (tipo === 'transfer' && m.type.startsWith('transfer')))).sort((a, b) => b.dayOffset - a.dayOffset);
  return (
    <>
      <DemoBanner />
      <PageHead title="Movimentações" subtitle="O estoque de cada produto é a soma destas movimentações." action={<ButtonLink href={`/admin/business/estoque/movimentacoes/nova${q}`} size="sm" icon="plus">Registrar</ButtonLink>} />
      <StockTabs active="/admin/business/estoque/movimentacoes" query={q} />
      <nav aria-label="Filtrar por tipo" className="mb-3 flex flex-wrap gap-2">{FILTERS.map((f) => (<Link key={f.id} href={pageHref('/admin/business/estoque/movimentacoes', f.id ? { ...base, tipo: f.id } : base, 1)} aria-current={tipo === f.id ? 'true' : undefined} className={`press rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${tipo === f.id ? 'border-brand bg-brand text-on-brand' : 'border-line-ghost text-ink hover:bg-brand-wash'}`}>{f.label}</Link>))}</nav>
      <DataTable rows={rows} page={page} pageSize={8} hrefForPage={(p) => pageHref('/admin/business/estoque/movimentacoes', tipo ? { ...base, tipo } : base, p)} empty="Nenhuma movimentação neste filtro."
        columns={[{ key: 'd', header: 'Data', cell: (m) => dayLabel(m.dayOffset), className: 'tabular' }, { key: 't', header: 'Tipo', cell: (m) => <span className="font-semibold">{LABEL[m.type]}</span> }, { key: 'p', header: 'Produto', cell: (m) => PRODUCTS.find((p) => p.id === m.productId)?.name },
          { key: 'u', header: 'Unidade', cell: (m) => unitName(m.unitId) }, { key: 'q', header: 'Quantidade', cell: (m) => (m.qty > 0 ? `+${m.qty}` : String(m.qty)), className: 'tabular' }, { key: 'n', header: 'Motivo', cell: (m) => m.note }]} />
    </>
  );
}
