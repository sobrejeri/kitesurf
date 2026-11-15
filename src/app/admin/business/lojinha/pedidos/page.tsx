import Link from 'next/link';

import { DataTable, DemoBanner, PageHead, pageHref } from '@/components/business/kit';
import { OrderBadge, ShopTabs } from '@/components/business/shop-kit';
import { ORIGIN_LABEL, type ShopOrderStatus } from '@/lib/business/demo';
import { dayLabel, parseScope, scopeQuery, unitsInScope } from '@/lib/business/rules';
import { ORDER_STATUS_LABEL, orderTotals, ordersInScope } from '@/lib/business/shop';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Pedidos recebidos' };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const scope = parseScope(params); const q = scopeQuery(scope);
  const status = (typeof params.status === 'string' && params.status in ORDER_STATUS_LABEL ? params.status : '') as ShopOrderStatus | '';
  const page = Number(typeof params.pagina === 'string' ? params.pagina : 1) || 1;
  const rows = ordersInScope(new Set(unitsInScope(scope).map((u) => u.id))).filter((o) => !status || o.status === status);
  const keep: Record<string, string> = { ...(scope.unidade ? { unidade: scope.unidade } : scope.cidade ? { cidade: scope.cidade } : {}), ...(status ? { status } : {}) };
  const base: Record<string, string> = scope.unidade ? { unidade: scope.unidade } : scope.cidade ? { cidade: scope.cidade } : {};
  const chip = (s: string, label: string) => <Link key={s} href={pageHref('/admin/business/lojinha/pedidos', s ? { ...base, status: s } : base, 1)} aria-current={status === s ? 'page' : undefined} className={`press inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold ${status === s ? 'border-brand bg-brand text-on-brand' : 'border-line-ghost text-ink hover:bg-brand-wash'}`}>{label}</Link>;
  return (
    <>
      <DemoBanner />
      <PageHead title="Pedidos recebidos" subtitle="Pedidos feitos pela vitrine e por outras origens. Pagamento é combinado fora do VentoKite." />
      <ShopTabs active="/admin/business/lojinha/pedidos" query={q} />
      <nav aria-label="Filtro de situação" className="mb-3 flex flex-wrap gap-1.5">{chip('', 'Todos')}{(Object.keys(ORDER_STATUS_LABEL) as ShopOrderStatus[]).map((s) => chip(s, ORDER_STATUS_LABEL[s]))}</nav>
      <DataTable rows={rows} page={page} pageSize={6} hrefForPage={(n) => pageHref('/admin/business/lojinha/pedidos', keep, n)} empty="Nenhum pedido neste filtro."
        columns={[{ key: 'n', header: 'Pedido', cell: (o) => <Link href={`/admin/business/lojinha/pedidos/${o.id}${q}`} className="font-semibold text-brand">{o.number}</Link> }, { key: 'c', header: 'Cliente', cell: (o) => o.customer }, { key: 'o', header: 'Origem', cell: (o) => ORIGIN_LABEL[o.origin] },
          { key: 'd', header: 'Data', cell: (o) => dayLabel(o.createdOffset), className: 'tabular' }, { key: 'v', header: 'Total', cell: (o) => formatMoney(orderTotals(o).totalCents), className: 'tabular' }, { key: 's', header: 'Situação', cell: (o) => <OrderBadge status={o.status} /> }]} />
    </>
  );
}
