import Link from 'next/link';

export interface TabDef { href: string; label: string }
export function SectionTabs({ label, tabs, active, query = '' }: { label: string; tabs: readonly TabDef[]; active: string; query?: string }) {
  return (
    <nav aria-label={label} className="-mx-3 mb-4 overflow-x-auto px-3 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1.5">{tabs.map((t) => (
        <li key={t.href}><Link href={`${t.href}${query}`} aria-current={active === t.href ? 'page' : undefined} className={`press inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold ${active === t.href ? 'border-brand bg-brand text-on-brand' : 'border-line-ghost text-ink hover:bg-brand-wash'}`}>{t.label}</Link></li>))}</ul>
    </nav>
  );
}
const S = '/admin/business';
export const STAFF_TABS: readonly TabDef[] = [
  { href: `${S}/funcionarios`, label: 'Funcionários' }, { href: `${S}/funcionarios/convidar`, label: 'Convidar' }, { href: `${S}/funcionarios/vinculos`, label: 'Vínculos' },
  { href: `${S}/cargos`, label: 'Cargos' }, { href: `${S}/permissoes`, label: 'Permissões' }, { href: `${S}/auditoria`, label: 'Auditoria' },
];
export const COMPANY_TABS: readonly TabDef[] = [
  { href: `${S}/empresa`, label: 'Perfil' }, { href: `${S}/consolidado`, label: 'Visão consolidada' }, { href: `${S}/empresa/cadastro`, label: 'Cadastro de empresa' },
];
export const INSTRUCTOR_TABS: readonly TabDef[] = [
  { href: `${S}/instrutores`, label: 'Vinculados' }, { href: `${S}/instrutores/convidar`, label: 'Convidar' }, { href: `${S}/instrutores/vinculo`, label: 'Responder convite' }, { href: `${S}/instrutores/disponibilidade`, label: 'Disponibilidade' },
  { href: `${S}/instrutores/distribuicao`, label: 'Distribuição' }, { href: `${S}/instrutores/fila`, label: 'Fila interna' }, { href: `${S}/instrutores/historico`, label: 'Histórico' }, { href: `${S}/instrutores/desempenho`, label: 'Desempenho' },
];
