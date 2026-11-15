import Link from 'next/link';

import { Badge, type BadgeTone } from '@/components/ui';
import { ORDER_STATUS_LABEL } from '@/lib/business/shop';
import type { ShopOrderStatus } from '@/lib/business/demo';

const BASE = '/admin/business/lojinha';
export const SHOP_TABS = [
  { href: BASE, label: 'Visão' }, { href: `${BASE}/personalizar`, label: 'Personalização' }, { href: `${BASE}/vitrine`, label: 'Prévia da vitrine' },
  { href: `${BASE}/pedidos`, label: 'Pedidos' }, { href: `${BASE}/cupons`, label: 'Cupons' },
] as const;

export function ShopTabs({ active, query = '' }: { active: string; query?: string }) {
  return (
    <nav aria-label="Seções da lojinha" className="-mx-3 mb-4 overflow-x-auto px-3 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1.5">{SHOP_TABS.map((t) => (
        <li key={t.href}><Link href={`${t.href}${query}`} aria-current={active === t.href ? 'page' : undefined} className={`press inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold ${active === t.href ? 'border-brand bg-brand text-on-brand' : 'border-line-ghost text-ink hover:bg-brand-wash'}`}>{t.label}</Link></li>))}</ul>
    </nav>
  );
}
const TONE: Record<ShopOrderStatus, BadgeTone> = { received: 'warning', confirmed: 'brand', ready: 'success', delivered: 'quiet', cancelled: 'danger' };
export const OrderBadge = ({ status }: { status: ShopOrderStatus }) => <Badge tone={TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
