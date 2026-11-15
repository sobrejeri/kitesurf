import { DataTable, DemoBanner, PageHead } from '@/components/business/kit';
import { StockTabs } from '@/components/business/stock-kit';
import { TransferForm } from '@/components/business/stock-forms';
import { PRODUCTS, STOCK_MOVEMENTS } from '@/lib/business/demo';
import { dayLabel, parseScope, scopeQuery, unitName } from '@/lib/business/rules';

export const metadata = { title: 'Transferências entre unidades' };

export default async function TransfersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseScope(await searchParams);
  const rows = STOCK_MOVEMENTS.filter((m) => m.type === 'transfer_out').map((out) => { const into = STOCK_MOVEMENTS.find((m) => m.transferId === out.transferId && m.type === 'transfer_in'); return { id: out.id, out, into }; });
  return (
    <>
      <DemoBanner />
      <PageHead title="Transferências entre unidades" subtitle="Sai de uma unidade e entra na outra na mesma operação." />
      <StockTabs active="/admin/business/estoque/transferencias" query={scopeQuery(scope)} />
      <TransferForm />
      <h2 className="mb-2 mt-6 text-[15px] font-semibold text-ink">Realizadas</h2>
      <DataTable rows={rows} page={1} pageSize={10} hrefForPage={() => '#'} empty="Nenhuma transferência registrada."
        columns={[{ key: 'd', header: 'Data', cell: (r) => dayLabel(r.out.dayOffset), className: 'tabular' }, { key: 'p', header: 'Produto', cell: (r) => <span className="font-semibold">{PRODUCTS.find((p) => p.id === r.out.productId)?.name}</span> },
          { key: 'o', header: 'De', cell: (r) => unitName(r.out.unitId) }, { key: 'u', header: 'Para', cell: (r) => (r.into ? unitName(r.into.unitId) : '—') }, { key: 'q', header: 'Quantidade', cell: (r) => String(Math.abs(r.out.qty)), className: 'tabular' }]} />
    </>
  );
}
