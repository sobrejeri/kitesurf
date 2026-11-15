import { Panel, PanelLink } from '@/components/admin/kit';
import { DemoBanner, PageHead, Stat } from '@/components/business/kit';
import { StockTabs } from '@/components/business/stock-kit';
import { EmptyState } from '@/components/ui';
import { currentContext } from '@/lib/business/bookings';
import { MAINTENANCE, RENTALS } from '@/lib/business/demo';
import { parseScope, scopeQuery, unitName } from '@/lib/business/rules';
import { equipmentInScope, equipmentStatus, lowStockRows, rentalState, totalStock } from '@/lib/business/stock';
import { PRODUCTS, EQUIPMENT } from '@/lib/business/demo';

export const metadata = { title: 'Estoque' };

export default async function StockDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseScope(await searchParams); const q = scopeQuery(scope);
  const now = currentContext().nowMinutes;
  const eq = equipmentInScope(scope); const ids = new Set(eq.map((e) => e.id));
  const count = (s: string) => eq.filter((e) => equipmentStatus(e) === s).length;
  const low = lowStockRows(scope);
  const rentals = RENTALS.filter((r) => !r.returned && ids.has(r.equipmentId));
  const overdue = rentals.filter((r) => rentalState(r, now) === 'overdue');
  const units = PRODUCTS.reduce((t, p) => t + totalStock(p.id, scope), 0);
  return (
    <>
      <DemoBanner />
      <PageHead title="Estoque e aluguéis" subtitle="Produtos por unidade e equipamentos individuais." />
      <StockTabs active="/admin/business/estoque" query={q} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Itens em estoque" value={String(units)} hint={`${PRODUCTS.length} produtos`} /><Stat label="Estoque baixo" value={String(low.length)} hint={low.length ? 'Repor ou transferir' : 'Tudo acima do mínimo'} />
        <Stat label="Equipamentos disponíveis" value={String(count('available'))} hint={`${count('rented')} alugado(s) · ${count('maintenance')} em manutenção`} /><Stat label="Aluguéis atrasados" value={String(overdue.length)} hint={`${rentals.length} em andamento`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Estoque baixo" action={<PanelLink href={`/admin/business/estoque/unidades${q}`} label="Por unidade" />}>
          {low.length === 0 ? <EmptyState>Nenhum produto abaixo do mínimo.</EmptyState> : <ul className="divide-y divide-line text-[13px]">{low.map((r) => (<li key={r.product.id + r.unitId} className="flex items-center justify-between gap-3 py-2.5"><span className="min-w-0"><strong className="block truncate text-ink">{r.product.name}</strong><span className="text-muted">{unitName(r.unitId)} · mínimo {r.product.minStock}</span></span><strong className="tabular text-ink">{r.qty}</strong></li>))}</ul>}
        </Panel>
        <Panel title="Aluguéis e manutenção" action={<PanelLink href={`/admin/business/estoque/alugueis${q}`} label="Aluguéis" />}>
          {rentals.length + MAINTENANCE.filter((m) => m.status === 'open').length === 0 ? <EmptyState>Nada em andamento.</EmptyState> : <ul className="divide-y divide-line text-[13px]">
            {rentals.map((r) => { const e = EQUIPMENT.find((x) => x.id === r.equipmentId); return <li key={r.id} className="py-2.5"><strong className="text-ink">{e?.code}</strong> <span className="text-muted">· {r.customer} · {r.start} · {r.hours} h{rentalState(r, now) === 'overdue' ? ' · atrasado' : ''}</span></li>; })}
            {MAINTENANCE.filter((m) => m.status === 'open').map((m) => <li key={m.id} className="py-2.5"><strong className="text-ink">{EQUIPMENT.find((x) => x.id === m.equipmentId)?.code}</strong> <span className="text-muted">· manutenção: {m.description}</span></li>)}</ul>}
        </Panel>
      </div>
    </>
  );
}
