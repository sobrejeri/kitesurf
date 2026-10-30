'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icon, type IconName } from './icon';
import { MobileHeader, SheetAccount, TabBar, isActive, type SheetLink, type TabItem } from './mobile';
import { AREAS } from '@/lib/areas';

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


export interface TopBarViewer {
  name: string;
  role: 'student' | 'instructor' | 'admin' | 'partner';
}

/**
 * Desktop account bar. An admin can open every area; everyone else sees their
 * own. On phones the same choices live in each shell's "Mais" sheet. Showing a
 * link is presentation only — each page checks the role again.
 */
export function TopBar({ viewer, signOut }: { viewer: TopBarViewer | null; signOut: () => Promise<void> }) {
  const pathname = usePathname();
  const areas = viewer ? AREAS.filter((area) => viewer.role === 'admin' || area.role === viewer.role) : [];
  return (
    <div className="sticky top-0 z-40 hidden h-14 items-center justify-between gap-3 border-b border-[#e5eaf5] bg-surface px-6 text-[12px] text-[#43547a] lg:flex">
      {areas.length > 1 ? (
        <nav aria-label="Áreas" className="flex rounded-[13px] bg-[#f2f4fa] p-1">
          {areas.map((area) => {
            const active = pathname.startsWith(area.prefix);
            return (
              <Link
                key={area.href}
                href={area.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-[10px] px-3 py-1.5 sm:px-4 ${active ? 'bg-brand font-[550] text-white' : 'text-[#6e7889] hover:text-brand'}`}
              >
                {area.label}
              </Link>
            );
          })}
        </nav>
      ) : (
        <Link href={areas[0]?.href ?? '/aluno/inicio'} className="flex items-center gap-2 font-[550]">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
          Vento · aulas de kitesurf
        </Link>
      )}
      {viewer ? (
        <div className="flex items-center gap-3">
          <span className="hidden text-subtle sm:inline">{viewer.name}</span>
          <form action={signOut}>
            <button type="submit" className="rounded-full border border-line px-3 py-1.5 font-[550] text-brand hover:bg-brand-wash">
              Sair
            </button>
          </form>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Link href="/entrar" className="rounded-full px-3 py-1.5 font-[550] text-brand">
            Entrar
          </Link>
          <Link href="/cadastro" className="rounded-full bg-brand px-3 py-1.5 font-[550] text-white">
            Criar conta
          </Link>
        </div>
      )}
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="mx-auto mt-14 hidden max-w-6xl flex-wrap items-center justify-between gap-3 px-8 pb-10 text-[11px] text-subtle md:flex">
      <Logo size="sm" />
      <p>Feito de mar, vento e boas histórias.</p>
      <Link href="/cadastro?perfil=partner" className="font-[550] text-brand">
        É pousada? Seja parceira
      </Link>
    </footer>
  );
}

/** The app icon alone, for the compact phone header. */
function LogoMark() {
  return (
    <Link href="/" aria-label="Vento — início" className="press shrink-0">
      {/* Static SVG mark; nothing for next/image to optimise. */}
      <img src="/icon.svg" alt="" width={30} height={30} className="rounded-[9px]" />
    </Link>
  );
}

function HeaderIconLink({ href, icon, label }: { href: string; icon: IconName; label: string }) {
  return (
    <Link href={href} aria-label={label} className="press grid h-10 w-10 place-items-center rounded-full text-[#5f6c80] active:bg-sand">
      <Icon name={icon} />
    </Link>
  );
}

const STUDENT_TABS: readonly TabItem[] = [
  { label: 'Explorar', href: '/aluno/inicio', icon: 'search', match: ['/aluno/reservar'] },
  { label: 'Minhas aulas', href: '/aluno/aulas', icon: 'book', match: ['/aluno/reserva', '/aluno/atendimento', '/aluno/ocorrencias'] },
  { label: 'Evolução', href: '/aluno/evolucao', icon: 'chart' },
  { label: 'Perfil', href: '/aluno/conta', icon: 'user', match: ['/aluno/central', '/aluno/avisos', '/aluno/politicas', '/aluno/acesso'] },
];

const STUDENT_TITLES: Readonly<Record<string, string>> = {
  '/aluno/reservar': 'Monte sua aula',
  '/aluno/reserva': 'Sua reserva',
  '/aluno/central': 'Central de aulas',
  '/aluno/avisos': 'Avisos',
  '/aluno/politicas': 'Políticas das aulas',
  '/aluno/acesso': 'Conta e acesso',
  '/aluno/atendimento': 'Conversa',
  '/aluno/ocorrencias': 'Imprevistos',
};

export function StudentShell({
  children,
  name,
  initials,
  signedIn,
}: {
  children: React.ReactNode;
  name: string;
  initials: string;
  signedIn: boolean;
}) {
  const pathname = usePathname();
  const subpage = Object.entries(STUDENT_TITLES).find(([route]) => pathname.startsWith(route));
  const tabs = signedIn
    ? STUDENT_TABS
    : STUDENT_TABS.map((tab) => (tab.href === '/aluno/conta' ? { ...tab, label: 'Entrar', href: '/entrar' } : tab));

  return (
    <>
      <header className="hidden border-b border-line bg-surface md:block">
        <div className="mx-auto flex h-[76px] max-w-6xl items-center justify-between gap-6 px-8">
          <Logo />
          <nav aria-label="Navegação do aluno" className="flex h-full items-stretch gap-8">
            {STUDENT_TABS.slice(0, 3).map((item) => {
              const active = isActive(pathname, item);
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
            <Link href="/aluno/avisos" aria-label="Avisos" className="grid h-10 w-10 place-items-center rounded-full border border-line text-[#7e8999]">
              <Icon name="bell" />
            </Link>
            {signedIn ? (
              <Link href="/aluno/conta" className="flex items-center gap-2.5">
                <Avatar initials={initials} tone="a3" size={36} />
                <span className="text-[12px] leading-tight">
                  <strong className="block font-[550] text-[#4f5e77]">{name}</strong>
                  <span className="text-[11px] text-subtle">Seu espaço no kite</span>
                </span>
              </Link>
            ) : (
              <Link href="/entrar" className="rounded-full bg-brand px-4 py-2 text-[12px] font-[550] text-white">
                Entrar
              </Link>
            )}
          </div>
        </div>
      </header>

      <MobileHeader
        leading={
          subpage ? (
            <button type="button" onClick={() => history.back()} aria-label="Voltar" className="press -ml-2 grid h-10 w-10 place-items-center rounded-full text-ink">
              <Icon name="back" />
            </button>
          ) : (
            <LogoMark />
          )
        }
        title={subpage ? subpage[1] : 'vento'}
        trailing={
          signedIn ? (
            <HeaderIconLink href="/aluno/avisos" icon="bell" label="Avisos" />
          ) : (
            <Link href="/entrar" className="press rounded-full bg-brand px-4 py-2 text-[12px] font-[550] text-white">
              Entrar
            </Link>
          )
        }
      />

      <main className="mx-auto max-w-6xl px-4 pb-tabbar pt-5 md:px-8 md:pb-0 md:pt-8">{children}</main>
      <SiteFooter />
      <TabBar items={tabs} label="Navegação do aluno" />
    </>
  );
}

export interface WorkspaceNavItem {
  label: string;
  href: string;
  icon: IconName;
  /** Reached from the central hub; named in the breadcrumb but not in the sidebar. */
  secondary?: boolean;
  /** One of the four tabs of the phone tab bar. */
  tab?: boolean;
}

export function WorkspaceShell({
  children,
  workspace,
  nav,
  tip,
  person,
  signOut,
  areas,
}: {
  children: React.ReactNode;
  workspace: string;
  nav: readonly WorkspaceNavItem[];
  tip: { title: string; body: string; icon: IconName };
  person: { name: string; initials: string; role: string };
  signOut: () => Promise<void>;
  areas?: readonly { label: string; href: string }[];
}) {
  const pathname = usePathname();
  const current = nav.find((item) => pathname.startsWith(item.href));
  const workspaceTitle = workspace.charAt(0) + workspace.slice(1).toLowerCase();
  const tabs = nav.filter((item) => item.tab).map(({ label, href, icon }) => ({ label: shortLabel(label), href, icon }));
  const sheetLinks: SheetLink[] = nav.filter((item) => !item.tab).map(({ label, href, icon }) => ({ label, href, icon }));

  return (
    <div className="flex min-h-dvh flex-col lg:min-h-[calc(100dvh-56px)] lg:flex-row">
      <aside className="hidden shrink-0 border-r border-[#e8ecf4] bg-surface lg:sticky lg:top-14 lg:flex lg:h-[calc(100dvh-56px)] lg:w-[228px] lg:flex-col">
        <div className="px-5 pb-6 pt-6">
          <Logo />
        </div>
        <p className="px-8 pb-2 text-[9px] font-[550] uppercase tracking-[1px] text-[#9aa5b4]">{workspace}</p>
        <nav aria-label={workspace} className="flex flex-col gap-1 overflow-y-auto px-5">
          {nav.filter((item) => !item.secondary).map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-input px-3 py-2.5 text-[13px] font-medium ${active ? 'bg-brand-soft text-brand' : 'text-subtle hover:bg-[#f5f7fc] hover:text-brand'}`}
              >
                <Icon name={item.icon} className="!h-[18px] !w-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto p-5">
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

      <MobileHeader
        breakpoint="lg"
        leading={<LogoMark />}
        title={current?.label ?? workspaceTitle}
        trailing={<span className="grid h-9 w-9 place-items-center rounded-full bg-[#eef1fa] text-[12px] font-[550] text-[#687da8]" aria-hidden="true">{person.initials}</span>}
      />

      <div className="min-w-0 flex-1">
        <div className="hidden h-[76px] items-center justify-between border-b border-line bg-surface px-9 lg:flex">
          <p className="flex items-center gap-2 text-[11px] text-[#8c97a8]">
            <span>{workspaceTitle}</span>
            <Icon name="chevron" className="!h-3.5 !w-3.5" />
            <strong className="font-[550] text-[#4d5d76]">{current?.label ?? ''}</strong>
          </p>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[11px] text-[#8a98a9]">
              <Icon name="pin" className="!h-4 !w-4" /> Preá, Ceará
            </span>
            <span className="grid h-10 w-10 place-items-center rounded-full border border-line text-[#7e8999]" aria-hidden="true">
              <Icon name="bell" />
            </span>
            <Avatar initials={person.initials} size={36} />
          </div>
        </div>
        <main className="mx-auto max-w-6xl px-4 pb-tabbar pt-5 sm:px-6 lg:px-9 lg:py-9">{children}</main>
      </div>

      <TabBar
        breakpoint="lg"
        label={workspace}
        items={tabs}
        more={{
          title: workspaceTitle,
          links: sheetLinks,
          footer: <SheetAccount name={person.name} subtitle={person.role} initials={person.initials} signOut={signOut} areas={areas} />,
        }}
      />
    </div>
  );
}

/** Tab labels have room for one or two short words. */
function shortLabel(label: string): string {
  const SHORT: Readonly<Record<string, string>> = {
    'Realizar e registrar aula': 'Aula',
    'Minha prioridade': 'Fila',
    'Meu financeiro': 'Financeiro',
    'Fila e distribuição': 'Fila',
    'Visão geral': 'Visão geral',
  };
  return SHORT[label] ?? label;
}

const PARTNER_NAV = [
  { label: 'Início', href: '/pousada/inicio', icon: 'home' },
  { label: 'Indicações', href: '/pousada/indicacoes', icon: 'users' },
  { label: 'Divulgação', href: '/pousada/divulgacao', icon: 'link' },
  { label: 'Cadastro', href: '/pousada/cadastro', icon: 'file' },
] as const satisfies readonly TabItem[];

export function PartnerShell({
  children,
  partner,
  signOut,
  areas,
}: {
  children: React.ReactNode;
  partner: { name: string; initials: string };
  signOut: () => Promise<void>;
  areas?: readonly { label: string; href: string }[];
}) {
  const pathname = usePathname();
  const current = PARTNER_NAV.find((item) => isActive(pathname, item));
  return (
    <>
      <header className="hidden border-b border-line bg-surface md:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-8 py-4">
          <div className="flex items-center gap-4">
            <Logo />
            <span className="text-[10px] font-[550] uppercase tracking-[1px] text-brand">Pousada parceira</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Avatar initials={partner.initials} tone="a4" size={36} />
            <span className="text-[12px] leading-tight">
              <strong className="block font-[550] text-[#4f5e77]">{partner.name}</strong>
              <span className="text-[11px] text-subtle">Pousada parceira</span>
            </span>
          </div>
        </div>
        <nav aria-label="Área da pousada" className="mx-auto flex max-w-6xl gap-6 px-8">
          {PARTNER_NAV.map((item) => {
            const active = isActive(pathname, item);
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
      <MobileHeader leading={<LogoMark />} title={current?.label ?? 'Pousada parceira'} />
      <section className="hidden border-b border-line bg-brand-tint md:block">
        <div className="mx-auto max-w-6xl px-8 py-5">
          <p className="text-[17px] font-semibold tracking-[-0.45px]">Indique bons momentos no mar</p>
          <p className="mt-1 text-[12px] text-muted">
            Comissões sobre aulas realizadas. O preço do hóspede e o líquido do instrutor são preservados.
          </p>
        </div>
      </section>
      <main className="mx-auto max-w-6xl px-4 pb-tabbar pt-5 md:px-8 md:pb-0 md:pt-7">{children}</main>
      <SiteFooter />
      <TabBar
        label="Área da pousada"
        items={PARTNER_NAV.slice(0, 3)}
        more={{
          title: 'Pousada parceira',
          links: PARTNER_NAV.slice(3),
          footer: <SheetAccount name={partner.name} subtitle="Pousada parceira" initials={partner.initials} signOut={signOut} areas={areas} />,
        }}
      />
    </>
  );
}
