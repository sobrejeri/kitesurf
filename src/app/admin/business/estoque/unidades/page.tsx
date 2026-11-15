import { DataTable, DemoBanner, PageHead } from '@/components/business/kit';
import { StockTabs } from '@/components/business/stock-kit';
import { Badge } from '@/components/ui';
import { PRODUCTS, UNITS } from '@/lib/business/demo';
import { parseScope, scopeQuery } from '@/lib/business/rules';
import { isLow, productStock, stockUnits } from '@/lib/business/stock';

export const metadata = { title: 'Estoque por unidade' };

export default async function StockByUnitPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseScope(await searchParams);
  const units = stockUnits(scope);
  return (
    <>
      <DemoBanner />
      <PageHead title="Estoque por unidade" subtitle="Cada unidade tem o seu estoque. Em destaque, o que está no mínimo ou abaixo." />
      <StockTabs active="/admin/business/estoque/unidades" query={scopeQuery(scope)} />
      <DataTable rows={PRODUCTS} page={1} pageSize={12} hrefForPage={() => '#'} empty="Nenhum produto."
        columns={[{ key: 'n', header: 'Produto', cell: (p) => <span className="font-semibold">{p.name}</span> },
          ...units.map((u) => ({ key: u, header: UNITS.find((x) => x.id === u)?.name ?? u, className: 'tabular', cell: (p: (typeof PRODUCTS)[number]) => <span className="inline-flex items-center gap-1.5">{productStock(p.id, u)}{isLow(p, u) ? <Badge tone="warning">baixo</Badge> : null}</span> }))]} />
    </>
  );
}
