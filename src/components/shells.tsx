'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icon, type IconName } from './icon';
import { Avatar } from './ui';

/**
 * Page frames for the four areas of the prototype.
 *
 * The student and partner areas are a mobile-first site with a header (and a
 * bottom bar on phones); the instructor and admin areas are a workspace with a
 * sidebar. Showing a link here is presentation only — when the prototype gets
 * a backend, each route still has to be authorised on the server.
 */

export function Logo({ size = 'md' }: { size?: 'md' | 'sm' }) {
  const box = size === 'sm' ? 26 : 34;
  return (
    <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Vento — início">
      <img src="/icon.svg" alt="" width={box} height={box} className="rounded-lg" />
      <span
        className={`font-semibold tracking-[-1.3px] text-logo-ink ${size === 'sm' ? 'text-[19px]' : 'text-[26px]'}`}
      >
        vento <span className="text-brand">.</span>
      </span>
    </Link>
  );
}

const ROLES = [
  { label: 'Aluno', href: '/aluno/inicio', prefix: '/aluno' },
  { label: 'Instrutor', href: '/instrutor/central', prefix: '/instrutor' },
  { label: 'Admin', href: '/admin/central', prefix: '/admin' },
  { label: 'Pousada', href: '/pousada/inicio', prefix: '/pousada' },
] as const;

/** The "navigable sketch" bar: switches between the four perspectives. */
export function DemoBar() {
  const pathname = usePathname();
  return (
    <div className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-[#e5eaf5] bg-surface px-4 text-[12px] text-[#43547a] sm:px-6">
      <p className="hidden items-center gap-2 font-[550] sm:flex">
        <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
        Esboço navegável
        <span className="font-normal text-subtle">Nome provisório · dados fictícios</span>
      </p>
      <nav aria-label="Perfis da demonstração" className="flex rounded-[13px] bg-[#f2f4fa] p-1">
        {ROLES.map((role) => {
          const active = pathname.startsWith(role.prefix);
          return (
            <Link
              key={role.href}
              href={role.href}
              aria-current={active ? 'page' : undefined}
              className={`rounded-[10px] px-3 py-1.5 sm:px-4 ${active ? 'bg-brand font-[550] text-white' : 'text-[#6e7889] hover:text-brand'}`}
            >
              {role.label}
            </Link>
          );
        })}
      </nav>
      <span className="hidden w-40 sm:block" aria-hidden="true" />
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="mx-auto mt-14 flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pb-28 text-[11px] text-subtle sm:px-8 sm:pb-10">
      <Logo size="sm" />
      <p>Feito de mar, vento e boas histórias.</p>
      <Link href="/pousada/cadastro" className="font-[550] text-brand">
        É pousada? Seja parceira
      </Link>
    </footer>
  );
}

const STUDENT_NAV: readonly { label: string; href: string; icon: IconName }[] = [
  { label: 'Explorar', href: '/aluno/inicio', icon: 'search' },
  { label: 'Minhas aulas', href: '/aluno/aulas', icon: 'book' },
  { label: 'Evolução', href: '/aluno/evolucao', icon: 'chart' },
  { label: 'Meu perfil', href: '/aluno/conta', icon: 'user' },
];

/** Routes that belong to "Minhas aulas" for the purpose of the active tab. */
const LESSON_ROUTES = ['/aluno/aulas', '/aluno/reserva', '/aluno/reservar', '/aluno/atendimento', '/aluno/ocorrencias'];

function studentActive(pathname: string, href: string): boolean {
  if (href === '/aluno/aulas') return LESSON_ROUTES.some((route) => pathname.startsWith(route));
  if (href === '/aluno/conta')
    return ['/aluno/conta', '/aluno/central', '/aluno/avisos', '/aluno/politicas', '/aluno/acesso'].some((route) =>
      pathname.startsWith(route),
    );
  return pathname.startsWith(href);
}

export function StudentShell({ children, name, initials }: { children: React.ReactNode; name: string; initials: string }) {
  const pathname = usePathname();
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-[76px] max-w-6xl items-center justify-between gap-6 px-4 sm:px-8">
          <Logo />
          <nav aria-label="Navegação do aluno" className="hidden h-full items-stretch gap-8 md:flex">
            {STUDENT_NAV.slice(0, 3).map((item) => {
              const active = studentActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center border-b-2 text-[13px] font-medium ${active ? 'border-brand text-brand' : 'border-transparent text-[#8993a2] hover:text-brand'}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/aluno/avisos"
              aria-label="Avisos"
              className="grid h-10 w-10 place-items-center rounded-full border border-line text-[#7e8999]"
            >
              <Icon name="bell" />
            </Link>
            <Link href="/aluno/conta" className="hidden items-center gap-2.5 md:flex">
              <Avatar initials={initials} tone="a3" size={36} />
              <span className="text-[12px] leading-tight">
                <strong className="block font-[550] text-[#4f5e77]">{name}</strong>
                <span className="text-[11px] text-subtle">Seu espaço no kite</span>
              </span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-8 sm:pt-8">{children}</main>
      <SiteFooter />

      <nav
        aria-label="Navegação do aluno"
        className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-[#edf0f6] bg-white/95 px-2 pb-4 pt-2.5 shadow-[0_-3px_18px_#243a6503] backdrop-blur md:hidden"
      >
        {STUDENT_NAV.map((item) => {
          const active = studentActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 text-[10px] ${active ? 'font-medium text-brand' : 'text-subtle'}`}
            >
              <Icon name={item.icon} className="!h-[21px] !w-[21px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export interface WorkspaceNavItem {
  label: string;
  href: string;
  icon: IconName;
  /** Reached from the central hub; named in the breadcrumb but not in the sidebar. */
  secondary?: boolean;
}

export function WorkspaceShell({
  children,
  workspace,
  nav,
  tip,
  person,
}: {
  children: React.ReactNode;
  workspace: string;
  nav: readonly WorkspaceNavItem[];
  tip: { title: string; body: string; icon: IconName };
  person: { name: string; initials: string; role: string };
}) {
  const pathname = usePathname();
  const current = nav.find((item) => pathname.startsWith(item.href));

  return (
    <div className="flex min-h-[calc(100dvh-56px)] flex-col lg:flex-row">
      <aside className="shrink-0 border-b border-[#e8ecf4] bg-surface lg:sticky lg:top-14 lg:flex lg:h-[calc(100dvh-56px)] lg:w-[228px] lg:flex-col lg:border-b-0 lg:border-r">
        <div className="hidden px-5 pb-6 pt-6 lg:block">
          <Logo />
        </div>
        <p className="hidden px-8 pb-2 text-[9px] font-[550] uppercase tracking-[1px] text-[#9aa5b4] lg:block">
          {workspace}
        </p>
        <nav aria-label={workspace} className="flex gap-1 overflow-x-auto px-3 py-2 lg:flex-col lg:overflow-visible lg:px-5 lg:py-0">
          {nav.filter((item) => !item.secondary).map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-3 whitespace-nowrap rounded-input px-3 py-2.5 text-[13px] font-medium lg:whitespace-normal ${active ? 'bg-brand-soft text-brand' : 'text-subtle hover:bg-[#f5f7fc] hover:text-brand'}`}
              >
                <Icon name={item.icon} className="!h-[18px] !w-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto hidden p-5 lg:block">
          <div className="rounded-[13px] border border-[#edf0f6] bg-[#f8f9fd] p-4 text-[11px] leading-relaxed text-muted">
            <Icon name={tip.icon} className="text-[#8498dc]" />
            <strong className="mt-3 block text-[12px] font-[550] text-[#61718c]">{tip.title}</strong>
            {tip.body}
          </div>
          <div className="mt-4 flex items-center gap-2.5 px-1">
            <Avatar initials={person.initials} size={34} />
            <span className="text-[12px] leading-tight">
              <strong className="block font-[550] text-[#61718c]">{person.name}</strong>
              <span className="text-[11px] text-subtle">{person.role}</span>
            </span>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex h-[76px] items-center justify-between border-b border-line bg-surface px-4 sm:px-9">
          <p className="flex items-center gap-2 text-[11px] text-[#8c97a8]">
            <span className="hidden sm:inline">{workspace.charAt(0) + workspace.slice(1).toLowerCase()}</span>
            <Icon name="chevron" className="hidden !h-3.5 !w-3.5 sm:inline" />
            <strong className="font-[550] text-[#4d5d76]">{current?.label ?? ''}</strong>
          </p>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-[11px] text-[#8a98a9] sm:flex">
              <Icon name="pin" className="!h-4 !w-4" /> Preá, Ceará
            </span>
            <span className="grid h-10 w-10 place-items-center rounded-full border border-line text-[#7e8999]" aria-hidden="true">
              <Icon name="bell" />
            </span>
            <Avatar initials={person.initials} size={36} />
          </div>
        </div>
        <main className="mx-auto max-w-6xl px-4 py-7 sm:px-9 sm:py-9">{children}</main>
      </div>
    </div>
  );
}

const PARTNER_NAV = [
  { label: 'Início', href: '/pousada/inicio' },
  { label: 'Indicações', href: '/pousada/indicacoes' },
  { label: 'Divulgação', href: '/pousada/divulgacao' },
  { label: 'Cadastro', href: '/pousada/cadastro' },
] as const;

export function PartnerShell({
  children,
  partner,
}: {
  children: React.ReactNode;
  partner: { name: string; initials: string };
}) {
  const pathname = usePathname();
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <div className="flex items-center gap-4">
            <Logo />
            <span className="hidden text-[10px] font-[550] uppercase tracking-[1px] text-brand sm:inline">
              Pousada parceira
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <Avatar initials={partner.initials} tone="a4" size={36} />
            <span className="text-[12px] leading-tight">
              <strong className="block font-[550] text-[#4f5e77]">{partner.name}</strong>
              <span className="text-[11px] text-subtle">Pousada parceira</span>
            </span>
          </div>
        </div>
        <nav aria-label="Área da pousada" className="mx-auto flex max-w-6xl gap-6 overflow-x-auto px-4 sm:px-8">
          {PARTNER_NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`shrink-0 border-b-2 pb-3 text-[13px] ${active ? 'border-brand font-[550] text-brand' : 'border-transparent text-[#8993a2] hover:text-brand'}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <section className="border-b border-line bg-brand-tint">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-8">
          <p className="text-[17px] font-semibold tracking-[-0.45px]">Indique bons momentos no mar</p>
          <p className="mt-1 text-[12px] text-muted">
            Comissões sobre aulas realizadas. O preço do hóspede e o líquido do instrutor são preservados.
          </p>
        </div>
      </section>
      <main className="mx-auto max-w-6xl px-4 pt-7 sm:px-8">{children}</main>
      <SiteFooter />
    </>
  );
}
