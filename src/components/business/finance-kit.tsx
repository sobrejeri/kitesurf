import Link from 'next/link';

import { Badge, type BadgeTone } from '@/components/ui';
import type { DueStatus, SettlementStatus } from '@/lib/business/finance';
import { pageHref } from './kit';

export const FINANCE_TABS = [
  { href: '/admin/business/financeiro', label: 'Visão' }, { href: '/admin/business/financeiro/receitas', label: 'Receitas' }, { href: '/admin/business/financeiro/despesas', label: 'Despesas' },
  { href: '/admin/business/financeiro/receber', label: 'A receber' }, { href: '/admin/business/financeiro/pagar', label: 'A pagar' }, { href: '/admin/business/financeiro/comissoes', label: 'Comissões' },
  { href: '/admin/business/financeiro/pagamentos', label: 'Pagamentos externos' }, { href: '/admin/business/financeiro/fechamento', label: 'Fechamento' },
  { href: '/admin/business/financeiro/relatorios/consolidado', label: 'Relatórios' }, { href: '/admin/business/financeiro/comprovantes', label: 'Comprovantes' },
] as const;

/** Section tabs shared by every finance screen; scrolls sideways on phones. */
export function FinanceTabs({ active, query }: { active: string; query: string }) {
  return (
    <nav aria-label="Seções do financeiro" className="-mx-3 mb-4 overflow-x-auto px-3 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1.5">
        {FINANCE_TABS.map((t) => {
          const on = active === t.href || (t.href.includes('/relatorios') && active.includes('/relatorios'));
          return <li key={t.href}><Link href={`${t.href}${query}`} aria-current={on ? 'page' : undefined} className={`press inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold ${on ? 'border-brand bg-brand text-on-brand' : 'border-line-ghost text-ink hover:bg-brand-wash'}`}>{t.label}</Link></li>;
        })}
      </ul>
    </nav>
  );
}

export const PERIODS = [{ days: 7, label: '7 dias' }, { days: 30, label: '30 dias' }, { days: 90, label: '90 dias' }] as const;
export const periodFrom = (raw: string | string[] | undefined): number => {
  const v = Number(Array.isArray(raw) ? raw[0] : raw); return PERIODS.some((p) => p.days === v) ? v : 30;
};
export function PeriodNav({ base, keep, days }: { base: string; keep: Record<string, string>; days: number }) {
  return (
    <nav aria-label="Período" className="mb-3 flex flex-wrap gap-2">
      {PERIODS.map((p) => <Link key={p.days} href={pageHref(base, { ...keep, dias: String(p.days) }, 1)} aria-current={days === p.days ? 'true' : undefined}
        className={`press rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${days === p.days ? 'border-brand bg-brand text-on-brand' : 'border-line-ghost text-ink hover:bg-brand-wash'}`}>{p.label}</Link>)}
    </nav>
  );
}

const DUE: Record<DueStatus, { label: string; tone: BadgeTone }> = { paid: { label: 'Quitado', tone: 'success' }, partial: { label: 'Parcial', tone: 'brand' }, overdue: { label: 'Atrasado', tone: 'danger' }, open: { label: 'Em aberto', tone: 'quiet' } };
export const DueBadge = ({ status }: { status: DueStatus }) => <Badge tone={DUE[status].tone}>{DUE[status].label}</Badge>;
const SETTLE: Record<SettlementStatus, { label: string; tone: BadgeTone }> = { settled: { label: 'Quitado', tone: 'success' }, partial: { label: 'Pago em parte', tone: 'brand' }, pending: { label: 'Pendente', tone: 'warning' } };
export const SettleBadge = ({ status }: { status: SettlementStatus }) => <Badge tone={SETTLE[status].tone}>{SETTLE[status].label}</Badge>;
