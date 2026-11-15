import Link from 'next/link';

import { EmptyState } from '@/components/ui';
import { EQUIPMENT, PRODUCTS, SERVICES, UNITS, UNIT_SERVICES, type EquipmentType } from '@/lib/business/demo';
import { cities, parseScope, scopeQuery, unitsInScope } from '@/lib/business/rules';
import { effectivePriceCents } from '@/lib/business/services';
import { rentalAvailable } from '@/lib/business/shop';
import { HOURLY_CENTS, TYPE_LABEL, productStock } from '@/lib/business/stock';
import { formatMinutes, formatMoney } from '@/lib/format';

export const metadata = { title: 'Catálogo público' };
const BASE = '/admin/business/lojinha/vitrine';

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseScope(await searchParams); const q = scopeQuery(scope);
  const units = unitsInScope(scope).filter((u) => u.active); const ids = new Set(units.map((u) => u.id));
  const lessons = SERVICES.filter((s) => UNIT_SERVICES.some((c) => c.serviceId === s.id && ids.has(c.unitId)));
  const products = PRODUCTS.filter((p) => units.some((u) => productStock(p.id, u.id) > 0));
  const types = (Object.keys(HOURLY_CENTS) as EquipmentType[]).filter((t) => units.some((u) => rentalAvailable(t, u.id) > 0));
  const chip = (href: string, label: string, on: boolean) => <Link key={href} href={href} aria-current={on ? 'page' : undefined} className={`press inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold ${on ? 'border-brand bg-brand text-on-brand' : 'border-line-ghost text-ink hover:bg-brand-wash'}`}>{label}</Link>;
  return (
    <div className="grid gap-6">
      <nav aria-label="Filtro de local" className="flex flex-wrap gap-1.5">
        {chip(`${BASE}/catalogo`, 'Todas', !scope.cidade && !scope.unidade)}
        {cities().filter((c) => UNITS.some((u) => u.active && u.city === c)).map((c) => chip(`${BASE}/catalogo?cidade=${encodeURIComponent(c)}`, c, scope.cidade === c && !scope.unidade))}
        {UNITS.filter((u) => u.active && (!scope.cidade || u.city === scope.cidade)).map((u) => chip(`${BASE}/catalogo?unidade=${u.id}`, u.name, scope.unidade === u.id))}
      </nav>
      <section aria-labelledby="h-aulas"><h2 id="h-aulas" className="mb-2 text-[16px] font-semibold text-ink">Aulas e serviços</h2>
        {lessons.length === 0 ? <EmptyState>Nenhuma aula neste filtro.</EmptyState> : <ul className="grid gap-3 sm:grid-cols-3">{lessons.map((s) => { const prices = UNIT_SERVICES.filter((c) => c.serviceId === s.id && ids.has(c.unitId)).map((c) => effectivePriceCents(s, c)); const from = Math.min(...prices);
          return <li key={s.id}><Link href={`${BASE}/aulas/${s.id}${q}`} className="press block h-full rounded-[14px] border border-line bg-surface p-4 shadow-card"><p className="text-[15px] font-semibold text-ink">{s.name}</p><p className="mt-1 text-[12.5px] text-muted">{formatMinutes(s.minutes)} · até {s.capacity} aluno(s)</p><p className="tabular mt-2 text-[14px] font-bold text-ink">{prices.length > 1 && Math.max(...prices) !== from ? 'a partir de ' : ''}{formatMoney(from)}</p></Link></li>; })}</ul>}</section>
      <section aria-labelledby="h-prod"><h2 id="h-prod" className="mb-2 text-[16px] font-semibold text-ink">Produtos</h2>
        {products.length === 0 ? <EmptyState>Nenhum produto neste filtro.</EmptyState> : <ul className="grid gap-3 sm:grid-cols-3">{products.map((p) => <li key={p.id}><Link href={`${BASE}/produtos/${p.id}${q}`} className="press block h-full rounded-[14px] border border-line bg-surface p-4 shadow-card"><p className="text-[15px] font-semibold text-ink">{p.name}</p><p className="mt-1 text-[12.5px] text-muted">{p.category}</p><p className="tabular mt-2 text-[14px] font-bold text-ink">{formatMoney(p.priceCents)}</p></Link></li>)}</ul>}</section>
      <section aria-labelledby="h-alu"><h2 id="h-alu" className="mb-2 text-[16px] font-semibold text-ink">Aluguel de equipamentos</h2>
        {types.length === 0 ? <EmptyState>Nenhum equipamento livre neste filtro.</EmptyState> : <ul className="grid gap-3 sm:grid-cols-3">{types.map((t) => <li key={t}><Link href={`${BASE}/alugueis${q}`} className="press block h-full rounded-[14px] border border-line bg-surface p-4 shadow-card"><p className="text-[15px] font-semibold text-ink">{TYPE_LABEL[t]}</p><p className="tabular mt-2 text-[14px] font-bold text-ink">{formatMoney(HOURLY_CENTS[t])} por hora</p><p className="mt-1 text-[12.5px] text-muted">{units.reduce((n, u) => n + rentalAvailable(t, u.id), 0)} disponível(is) de {EQUIPMENT.filter((e) => e.type === t && ids.has(e.unitId)).length}</p></Link></li>)}</ul>}</section>
    </div>
  );
}
