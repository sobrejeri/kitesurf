import Link from 'next/link';

import { Badge, type BadgeTone } from '@/components/ui';
import { CONDITION_LABEL, STATUS_LABEL, type EquipmentStatus, type RentalState } from '@/lib/business/stock';
import type { Condition } from '@/lib/business/demo';

const BASE = '/admin/business/estoque';
export const STOCK_TABS = [
  { href: BASE, label: 'Visão' }, { href: `${BASE}/produtos`, label: 'Produtos' }, { href: `${BASE}/equipamentos`, label: 'Equipamentos' }, { href: `${BASE}/unidades`, label: 'Por unidade' },
  { href: `${BASE}/movimentacoes`, label: 'Movimentações' }, { href: `${BASE}/transferencias`, label: 'Transferências' }, { href: `${BASE}/alugueis`, label: 'Aluguéis' },
  { href: `${BASE}/devolucoes`, label: 'Devoluções' }, { href: `${BASE}/manutencao`, label: 'Manutenção' }, { href: `${BASE}/relatorios`, label: 'Relatórios' },
] as const;

export function StockTabs({ active, query }: { active: string; query: string }) {
  return (
    <nav aria-label="Seções do estoque" className="-mx-3 mb-4 overflow-x-auto px-3 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1.5">{STOCK_TABS.map((t) => (
        <li key={t.href}><Link href={`${t.href}${query}`} aria-current={active === t.href ? 'page' : undefined} className={`press inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold ${active === t.href ? 'border-brand bg-brand text-on-brand' : 'border-line-ghost text-ink hover:bg-brand-wash'}`}>{t.label}</Link></li>))}</ul>
    </nav>
  );
}
const ST: Record<EquipmentStatus, BadgeTone> = { available: 'success', rented: 'brand', maintenance: 'warning', retired: 'quiet' };
export const EquipmentBadge = ({ status }: { status: EquipmentStatus }) => <Badge tone={ST[status]}>{STATUS_LABEL[status]}</Badge>;
const CT: Record<Condition, BadgeTone> = { novo: 'success', bom: 'success', regular: 'warning', ruim: 'danger' };
export const ConditionBadge = ({ condition }: { condition: Condition }) => <Badge tone={CT[condition]}>{CONDITION_LABEL[condition]}</Badge>;
const RT: Record<RentalState, { label: string; tone: BadgeTone }> = { active: { label: 'Em andamento', tone: 'brand' }, overdue: { label: 'Atrasado', tone: 'danger' }, returned: { label: 'Devolvido', tone: 'success' } };
export const RentalBadge = ({ state }: { state: RentalState }) => <Badge tone={RT[state].tone}>{RT[state].label}</Badge>;
