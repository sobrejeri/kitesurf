import { DataTable, DemoBanner, PageHead } from '@/components/business/kit';
import { StockTabs } from '@/components/business/stock-kit';
import { Badge, ButtonLink } from '@/components/ui';
import { PRODUCTS } from '@/lib/business/demo';
import { parseScope, scopeQuery } from '@/lib/business/rules';
import { lowStockRows, totalStock } from '@/lib/business/stock';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Produtos' };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseScope(await searchParams); const q = scopeQuery(scope);
  const low = new Set(lowStockRows(scope).map((r) => r.product.id));
  return (
    <>
      <DemoBanner />
      <PageHead title="Produtos" subtitle="Cadastro de produtos da loja. A quantidade vem das movimentações." action={<ButtonLink href={`/admin/business/estoque/produtos/novo${q}`} size="sm" icon="plus">Novo produto</ButtonLink>} />
      <StockTabs active="/admin/business/estoque/produtos" query={q} />
      <DataTable rows={PRODUCTS} page={1} pageSize={10} hrefForPage={() => '#'} empty="Nenhum produto cadastrado."
        columns={[{ key: 'n', header: 'Produto', cell: (p) => <span className="font-semibold">{p.name}</span> }, { key: 's', header: 'Código', cell: (p) => p.sku, className: 'font-mono' }, { key: 'c', header: 'Categoria', cell: (p) => p.category },
          { key: 'p', header: 'Preço', cell: (p) => formatMoney(p.priceCents), className: 'tabular' }, { key: 'q', header: 'Em estoque', cell: (p) => String(totalStock(p.id, scope)), className: 'tabular' }, { key: 'm', header: 'Mínimo', cell: (p) => String(p.minStock), className: 'tabular' },
          { key: 'x', header: 'Situação', cell: (p) => <Badge tone={low.has(p.id) ? 'warning' : 'success'}>{low.has(p.id) ? 'Estoque baixo' : 'Em dia'}</Badge> }]} />
    </>
  );
}
