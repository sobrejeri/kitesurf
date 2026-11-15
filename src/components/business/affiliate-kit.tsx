import Link from 'next/link';

import { Badge, Note, type BadgeTone } from '@/components/ui';
import { STATE_LABEL, type CommissionState } from '@/lib/business/affiliates';

const BASE = '/admin/business/afiliados';
export const AFFILIATE_TABS = [
  { href: BASE, label: 'Central' }, { href: `${BASE}/campanhas`, label: 'Campanhas' }, { href: `${BASE}/selecao`, label: 'Divulgação' }, { href: `${BASE}/comissoes`, label: 'Comissões' },
  { href: `${BASE}/solicitacoes`, label: 'Solicitações' }, { href: `${BASE}/vinculados`, label: 'Vinculados' }, { href: `${BASE}/relatorios`, label: 'Vendas atribuídas' }, { href: `${BASE}/historico`, label: 'Histórico' },
] as const;

export function AffiliateTabs({ active, query = '' }: { active: string; query?: string }) {
  return (
    <nav aria-label="Seções de afiliados" className="-mx-3 mb-4 overflow-x-auto px-3 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1.5">{AFFILIATE_TABS.map((t) => (
        <li key={t.href}><Link href={`${t.href}${query}`} aria-current={active === t.href ? 'page' : undefined} className={`press inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold ${active === t.href ? 'border-brand bg-brand text-on-brand' : 'border-line-ghost text-ink hover:bg-brand-wash'}`}>{t.label}</Link></li>))}</ul>
    </nav>
  );
}
const TONE: Record<CommissionState, BadgeTone> = { expected: 'quiet', due: 'warning', cancelled: 'danger', refunded: 'danger' };
export const CommissionBadge = ({ state }: { state: CommissionState }) => <Badge tone={TONE[state]}>{STATE_LABEL[state]}</Badge>;

export const PaymentNotice = () => (
  <Note tone="warning" title="Pagamento integrado ainda não habilitado" className="mb-4">O pagamento das comissões pelo VentoKite só começa quando a função financeira for habilitada e homologada. Até lá, nenhuma comissão é marcada como paga: o máximo é “a pagar”.</Note>
);
