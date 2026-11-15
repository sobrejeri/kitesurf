import { notFound } from 'next/navigation';

import { AddProductForm } from '@/components/business/cart';
import { PRODUCTS, UNITS } from '@/lib/business/demo';
import { productStock } from '@/lib/business/stock';
import { formatMoney } from '@/lib/format';
import { Badge } from '@/components/ui';

export const metadata = { title: 'Detalhes do produto' };

export default async function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = PRODUCTS.find((x) => x.id === id); if (!p) notFound();
  return (
    <div className="grid gap-4">
      <div><h2 className="text-[22px] font-bold text-ink">{p.name}</h2><p className="mt-1 text-[13px] text-muted">{p.category} · código {p.sku}</p><p className="tabular mt-2 text-[20px] font-bold text-ink">{formatMoney(p.priceCents)}</p></div>
      <ul className="grid gap-2 sm:grid-cols-3">{UNITS.filter((u) => u.active).map((u) => { const n = productStock(p.id, u.id); return <li key={u.id} className="flex items-center justify-between gap-2 rounded-[14px] border border-line bg-surface p-3.5 text-[13px]"><span className="font-semibold text-ink">{u.name}</span>{n > 0 ? <Badge tone="success">{n} disponíveis</Badge> : <Badge tone="quiet">Indisponível</Badge>}</li>; })}</ul>
      <AddProductForm productId={p.id} />
    </div>
  );
}
