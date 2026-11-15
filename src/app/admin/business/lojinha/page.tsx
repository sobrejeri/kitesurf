import { Panel, PanelLink } from '@/components/admin/kit';
import { DemoBanner, PageHead, Stat } from '@/components/business/kit';
import { OrderBadge, ShopTabs } from '@/components/business/shop-kit';
import { EmptyState } from '@/components/ui';
import { COUPONS, ORIGIN_LABEL, STORE } from '@/lib/business/demo';
import { parseScope, scopeQuery, unitsInScope } from '@/lib/business/rules';
import { orderTotals, ordersInScope, originTotals } from '@/lib/business/shop';
import { dayLabel } from '@/lib/business/rules';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Lojinha da escola' };

export default async function ShopDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseScope(await searchParams); const q = scopeQuery(scope);
  const orders = ordersInScope(new Set(unitsInScope(scope).map((u) => u.id)));
  const live = orders.filter((o) => o.status !== 'cancelled');
  const gross = live.reduce((n, o) => n + orderTotals(o).totalCents, 0);
  const pending = orders.filter((o) => o.status === 'received').length;
  const origins = originTotals(orders);
  return (
    <>
      <DemoBanner />
      <PageHead title="Lojinha da escola" subtitle={`${STORE.name} · ${STORE.published ? 'vitrine publicada' : 'vitrine ainda não publicada'}`} />
      <ShopTabs active="/admin/business/lojinha" query={q} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pedidos recebidos" value={String(orders.length)} hint={`${pending} aguardando confirmação`} />
        <Stat label="Valor dos pedidos" value={formatMoney(gross)} hint="Pedidos, não pagamentos confirmados" />
        <Stat label="Ticket médio" value={formatMoney(live.length ? Math.round(gross / live.length) : 0)} />
        <Stat label="Cupons ativos" value={String(COUPONS.filter((c) => c.active && c.untilOffset >= 0 && c.used < c.maxUses).length)} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Origem das vendas">
          {origins.length === 0 ? <EmptyState>Sem pedidos neste filtro.</EmptyState> : <ul className="divide-y divide-line text-[13px]">{origins.map((o) => <li key={o.origin} className="flex justify-between gap-3 py-2.5"><span className="text-ink">{o.origin} <span className="text-muted">· {o.orders} pedido(s)</span></span><span className="tabular font-semibold text-ink">{formatMoney(o.cents)}</span></li>)}</ul>}
        </Panel>
        <Panel title="Pedidos recentes" action={<PanelLink href={`/admin/business/lojinha/pedidos${q}`} label="Todos" />}>
          {orders.length === 0 ? <EmptyState>Nenhum pedido neste filtro.</EmptyState> : <ul className="divide-y divide-line text-[13px]">{orders.slice(0, 5).map((o) => <li key={o.id} className="flex items-center justify-between gap-3 py-2.5"><span className="min-w-0"><a href={`/admin/business/lojinha/pedidos/${o.id}`} className="font-semibold text-brand">{o.number}</a> <span className="text-muted">· {o.customer} · {ORIGIN_LABEL[o.origin]} · {dayLabel(o.createdOffset)}</span></span><OrderBadge status={o.status} /></li>)}</ul>}
        </Panel>
      </div>
    </>
  );
}
