'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icon, type IconName } from './icon';
import { OfficialLogo } from './official-logo';
import { MenuButton, MobileHeader, SheetAccount, TabBar, isActive, type SheetLink, type TabItem } from './mobile';
import { StudentBrand } from './student/sunset';
import { KiteModelo3Brand } from './student/modelo3-header';
import { StudentProfileAvatar } from './student/profile-avatar';
import { StudentSwipePager } from './student/swipe-pager';
import { areaFromPath } from '@/lib/app-areas';
import { AREAS } from '@/lib/areas';

import { Avatar } from './ui';
import { studentSafeBackHref } from '@/lib/student-safe-back';

/**
 * Page frames for the four areas of the prototype.
 *
 * The student and partner areas are a mobile-first site with a header (and a
 * bottom bar on phones); the instructor and admin areas are a workspace with a
 * sidebar. Showing a link here is presentation only — when the prototype gets
 * a backend, each route still has to be authorised on the server.
 */

export function Logo({ size = 'md' }: { size?: 'md' | 'sm' }) {
  return (
    <Link href="/" className="inline-flex min-w-0 items-center" aria-label="VentoKite — início">
      <OfficialLogo compact={size === 'sm'} />
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
  const app = areaFromPath(pathname);
  // The login screens are full-screen app screens of their own.
  if (pathname === '/entrar' || /^\/[a-z]+\/(entrar|criar-conta|recuperar|redefinir)/.test(pathname)) return null;
  return (
    <div className="sticky top-0 z-40 hidden h-14 items-center justify-between gap-3 border-b border-line bg-chrome px-6 text-[12px] text-label lg:flex">
      {areas.length > 1 ? (
        <nav aria-label="Áreas" className="flex rounded-[13px] bg-sand p-1">
          {areas.map((area) => {
            const active = pathname.startsWith(area.prefix);
            return (
              <Link
                key={area.href}
                href={area.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-[10px] px-3 py-1.5 sm:px-4 ${active ? 'bg-brand font-[550] text-on-brand' : 'text-muted hover:text-brand'}`}
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
          <Link href={`/${app}/entrar`} className="rounded-full px-3 py-1.5 font-[550] text-brand">
            Entrar
          </Link>
          <Link href={app === 'admin' ? '/entrar' : `/${app}/criar-conta`} className="rounded-full bg-brand px-3 py-1.5 font-[550] text-white">
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
      <Link href="/pousada/criar-conta" className="font-[550] text-brand">
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

const STUDENT_TABS: readonly TabItem[] = [
  { label: 'Explorar', href: '/aluno/inicio', icon: 'search', match: ['/aluno/reservar'] },
  { label: 'Minhas aulas', href: '/aluno/aulas', icon: 'book', match: ['/aluno/reserva', '/aluno/solicitacao', '/aluno/atendimento', '/aluno/ocorrencias'] },
  { label: 'Evolução', href: '/aluno/evolucao', icon: 'chart' },
  { label: 'Perfil', href: '/aluno/conta', icon: 'user', match: ['/aluno/central', '/aluno/avisos', '/aluno/politicas'] },
];

/** Pages reached from inside another tab: they get a back arrow on phones. */
const STUDENT_SUBPAGES = [
  '/aluno/reservar',
  '/aluno/reserva',
  '/aluno/central',
  '/aluno/avisos',
  '/aluno/politicas',
  '/aluno/atendimento',
  '/aluno/ocorrencias',
  '/aluno/solicitacao',
];

const STUDENT_MENU: readonly SheetLink[] = [
  { label: 'Central de aulas', href: '/aluno/central', icon: 'grid' },
  { label: 'Laboratório 3D do kite', href: '/laboratorio-kite.html', icon: 'wind' },
  { label: 'Avisos', href: '/aluno/avisos', icon: 'bell' },
  { label: 'Regras das aulas', href: '/aluno/politicas', icon: 'shield' },
  { label: 'Imprevistos', href: '/aluno/ocorrencias', icon: 'wind' },
  { label: 'Conversas', href: '/aluno/atendimento', icon: 'chat' },
];

/**
 * Student area, sunset theme. Every student page opens with a photo hero;
 * on phones the app bar floats over it and the tab bar sits at the bottom.
 */
export function StudentShell({
  children,
  name,
  initials,
  photoUrl,
  signedIn,
  signOut,
}: {
  children: React.ReactNode;
  name: string;
  initials: string;
  photoUrl?: string | null;
  signedIn: boolean;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  // The four approved screens and the remaining student workflows share one
  // desktop workspace. Mobile keeps its exact original shell and components.
  const desktopRedesign = [
    '/aluno/inicio','/aluno/aulas','/aluno/evolucao','/aluno/conta',
    '/aluno/reservar','/aluno/atendimento','/aluno/avisos',
    '/aluno/central','/aluno/ocorrencias','/aluno/politicas',
  ].includes(pathname) || /^\/aluno\/(?:reserva|solicitacao|atendimento)\/[^/]+$/.test(pathname);
  const desktopLinks: readonly { href: string; label: string; icon: IconName; match?: readonly string[] }[] = [
    {href:'/aluno/inicio',label:'Início',icon:'home'},
    {href:'/aluno/aulas',label:'Minhas aulas',icon:'calendar',match:['/aluno/reserva','/aluno/solicitacao']},
    {href:'/aluno/evolucao',label:'Evolução',icon:'chart'},
    {href:'/aluno/conta',label:'Perfil',icon:'user'},
    {href:'/aluno/atendimento',label:'Atendimento',icon:'chat'},
    {href:'/aluno/avisos',label:'Avisos',icon:'bell'},
    {href:'/aluno/central',label:'Central de aulas',icon:'book'},
    {href:'/aluno/ocorrencias',label:'Ocorrências',icon:'shield'},
    {href:'/aluno/politicas',label:'Políticas e regras',icon:'file'},
  ];
  const subpage = STUDENT_SUBPAGES.some((route) => pathname.startsWith(route));
  // Minhas aulas has its own tab switcher, so the phone top drops the menu there.
  const hideTopMenu = pathname === '/aluno/aulas' || pathname.startsWith('/aluno/aulas/')
    || pathname === '/aluno/evolucao' || pathname.startsWith('/aluno/evolucao/');
  const showCompactBrand = !['/aluno/inicio', '/aluno/aulas', '/aluno/evolucao', '/aluno/conta']
    .some((route) => pathname === route || pathname.startsWith(route + '/'));
  const tabs = signedIn
    ? STUDENT_TABS
    : STUDENT_TABS.map((tab) => (tab.href === '/aluno/conta' ? { ...tab, label: 'Entrar', href: '/aluno/entrar' } : tab));

  return (
    <div className={`theme-beach theme-mar-profundo min-h-dvh w-full min-w-0 max-w-full overflow-x-clip bg-canvas text-ink ${desktopRedesign ? 'vento-student-redesign' : ''}`}>
      {desktopRedesign ? (
        <aside className="vento-pc-sidebar" aria-label="Menu lateral do aluno">
          <Link className="vento-pc-sidebar-logo" href="/aluno/inicio" aria-label="VentoKite — Início"><OfficialLogo /></Link>
          <nav className="vento-pc-side-nav" aria-label="Páginas do aluno">
            {desktopLinks.map((item,index)=>{
              const active = isActive(pathname,item);
              return <Link key={item.href} href={item.href}
                aria-current={active?'page':undefined}
                className={`vento-pc-side-link ${active?'is-active':''} ${index===6?'with-divider':''}`}>
                <Icon name={item.icon} /> <span>{item.label}</span>
              </Link>;
            })}
            <Link className="vento-pc-side-link" href="/laboratorio-kite.html"><Icon name="kite" /><span>Laboratório 3D</span></Link>
          </nav>
          {signedIn ? (
            <form className="vento-pc-side-signout" action={signOut}>
              <button type="submit"><Icon name="logout"/> Sair da conta</button>
            </form>
          ) : <Link className="vento-pc-side-signout" href="/aluno/entrar"><Icon name="user"/> Entrar</Link>}
          <div className="vento-pc-side-waves" aria-hidden="true" />
        </aside>
      ) : null}
      {desktopRedesign ? (
        <div className="vento-pc-account-bar">
          <Link href="/aluno/avisos" aria-label="Consultar avisos" className="vento-pc-notification"><Icon name="bell"/></Link>
          <Link href={signedIn?'/aluno/conta':'/aluno/entrar'} className="vento-pc-account">
            <StudentProfileAvatar name={name} initials={initials} photoUrl={photoUrl}/>
            <strong>{name}</strong><Icon name="chevronDown"/>
          </Link>
        </div>
      ) : null}
      <header className="vento-desktop-student-header hidden border-b border-line bg-chrome md:block">
        <div className="mx-auto flex h-[76px] max-w-6xl items-center justify-between gap-6 px-6 lg:px-8">
          <KiteModelo3Brand compact />
          <nav aria-label="Navegação do aluno" className="flex h-full items-stretch gap-7">
            {STUDENT_TABS.slice(0, 3).map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center border-b-2 text-[14px] font-medium ${active ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink'}`}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link href="/laboratorio-kite.html" className="flex items-center border-b-2 border-transparent text-[14px] font-medium text-muted hover:text-ink">
              Laboratório 3D
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/aluno/avisos" aria-label="Avisos" className="grid h-10 w-10 place-items-center rounded-full border border-line text-label">
              <Icon name="bell" />
            </Link>
            {signedIn ? (
              <Link href="/aluno/conta" aria-label="Abrir meu perfil" className="flex min-w-0 items-center gap-2.5 rounded-full focus-visible:outline-2 focus-visible:outline-brand">
                <StudentProfileAvatar name={name} initials={initials} photoUrl={photoUrl} />
                <span className="min-w-0 max-w-40 text-[12px] leading-tight">
                  <strong className="block truncate font-semibold text-ink">{name}</strong>
                  <span className="text-[11px] text-muted">Seu espaço no kite</span>
                </span>
              </Link>
            ) : (
              <Link href="/aluno/entrar" className="btn-primary press rounded-full px-5 py-2 text-[13px] font-[650] text-white">
                Entrar
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Installed app: content scrolls under a translucent status bar, so a
          strip the height of the notch keeps text from running under the clock. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[env(safe-area-inset-top)] bg-[#0b2a4a]/75 backdrop-blur-md md:hidden" aria-hidden="true" />

      {/* Phone app bar, floating over each page's photo hero. The bar itself is
          click-through so it never blocks content that sits near the top (e.g.
          the tabs on "Minhas aulas"); only its own buttons take clicks. */}
      <div className="pointer-events-none pt-safe absolute inset-x-0 top-0 z-30 md:hidden">
        <div className="flex h-16 items-center gap-1 px-4">
          {pathname === '/aluno/conta' ? (
            <Link href="/aluno/inicio" aria-label="Voltar ao início" className="press pointer-events-auto -ml-2 grid h-11 w-11 place-items-center rounded-full border border-[#2a8397] bg-[#002a40]/80 text-white focus-visible:outline-2 focus-visible:outline-[#baff08]">
              <Icon name="back" />
            </Link>
          ) : subpage ? (
            <Link href={studentSafeBackHref(pathname)} aria-label="Voltar para uma área do aluno" className="press pointer-events-auto -ml-2 grid h-10 w-10 place-items-center rounded-full text-white">
              <Icon name="back" />
            </Link>
          ) : null}
          {showCompactBrand ? <span className="pointer-events-auto min-w-0 flex-1 pl-2"><KiteModelo3Brand compact /></span> : <span className="flex-1" />}
          {hideTopMenu ? null : (
          <MenuButton
            className="pointer-events-auto kite-m3-menu-button"
            onPhoto
            studentStyle
            title="Menu"
            links={STUDENT_MENU}
            footer={
              signedIn ? (
                <SheetAccount name={name} subtitle="Aluno" initials={initials} photoUrl={photoUrl} signOut={signOut} />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/aluno/entrar" className="press rounded-full border border-line py-3 text-center text-[14px] font-[550] text-ink">Entrar</Link>
                  <Link href="/aluno/criar-conta" className="btn-primary press rounded-full py-3 text-center text-white">Criar conta</Link>
                </div>
              )
            }
          />
          )}
        </div>
      </div>

      <StudentSwipePager pathname={pathname} signedIn={signedIn}>
        {children}
      </StudentSwipePager>
      <SiteFooter />
      <div className="kite-m3-wave-band" aria-hidden="true">
        <svg viewBox="0 0 1200 110" preserveAspectRatio="none" focusable="false">
          <path d="M0 69 C185 115 265 34 427 73 S729 113 921 44 1097 24 1200 66 L1200 110 L0 110 Z" fill="#8bff0b" opacity=".96"/>
          <path d="M0 48 C225 92 322 114 521 59 S866 20 1025 60 1116 94 1200 82 L1200 110 L0 110 Z" fill="#05d4de" opacity=".98"/>
          <path d="M0 91 C178 52 268 98 448 90 S789 50 957 84 1117 106 1200 76 L1200 110 L0 110 Z" fill="#003e52" opacity=".9"/>
          <path d="M0 100 C203 113 277 85 482 103 S914 72 1200 107 L1200 110 L0 110 Z" fill="#00192b"/>
        </svg>
      </div>
      <TabBar
        items={tabs}
        label="Navegação do aluno"
        variant="underline"
        center={{ label: 'Agendar', href: '/aluno/reservar', icon: 'calendar' }}
      />
    </div>
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

function WorkspaceProfileAvatar({ person, size }: { person: { name: string; initials: string; photoUrl?: string | null; profileHref?: string }; size: number }) {
  const avatar = person.photoUrl ? (
    <span className="inline-block shrink-0 overflow-hidden rounded-full border border-line-ghost bg-sand" style={{ width: size, height: size }}>
      <img src={person.photoUrl} alt="" className="h-full w-full object-cover" />
    </span>
  ) : (
    <span className="inline-block shrink-0">
      <Avatar initials={person.initials} size={size} />
    </span>
  );

  return person.profileHref ? (
    <Link
      href={person.profileHref}
      aria-label="Abrir meu perfil"
      title="Meu perfil"
      className="press inline-flex shrink-0 items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      {avatar}
    </Link>
  ) : avatar;
}

export function WorkspaceShell({
  children,
  workspace,
  nav,
  tip,
  person,
  signOut,
  areas,
  theme = 'light',
  brandSubtitle,
}: {
  children: React.ReactNode;
  workspace: string;
  nav: readonly WorkspaceNavItem[];
  tip: { title: string; body: string; icon: IconName };
  person: { name: string; initials: string; role: string; photoUrl?: string | null; profileHref?: string; unreadCount?: number };
  signOut: () => Promise<void>;
  areas?: readonly { label: string; href: string }[];
  /** "sunset": the dark navy and orange look of the student and admin areas. */
  theme?: 'light' | 'sunset';
  /** Word under "Vento" in the sunset brand, e.g. "Admin". */
  brandSubtitle?: string;
}) {
  const sunset = theme === 'sunset';
  const pathname = usePathname();
  const current = nav.find((item) => pathname.startsWith(item.href));
  const alertsHref = nav.find((item) => item.href.endsWith('/avisos'))?.href;
  const unread = person.unreadCount ?? 0;
  const workspaceTitle = workspace.charAt(0) + workspace.slice(1).toLowerCase();
  const tabs = nav.filter((item) => item.tab).map(({ label, href, icon }) => ({ label: shortLabel(label), href, icon }));
  const sheetLinks: SheetLink[] = nav.filter((item) => !item.tab).map(({ label, href, icon }) => ({ label, href, icon }));

  return (
    <div className={`flex min-h-dvh flex-col lg:min-h-[calc(100dvh-56px)] lg:flex-row ${sunset ? 'theme-sunset bg-canvas text-ink' : ''}`}>
      <aside className="hidden shrink-0 border-r border-line bg-chrome lg:sticky lg:top-14 lg:flex lg:h-[calc(100dvh-56px)] lg:w-[228px] lg:flex-col">
        <div className="px-5 pb-6 pt-6">
          {sunset ? <StudentBrand subtitle={brandSubtitle} /> : <Logo />}
        </div>
        <p className="px-8 pb-2 text-[9px] font-[550] uppercase tracking-[1px] text-faint">{workspace}</p>
        <nav aria-label={workspace} className="flex flex-col gap-1 overflow-y-auto px-5">
          {nav.filter((item) => !item.secondary).map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-input px-3 py-2.5 text-[13px] font-medium ${active ? 'bg-brand-soft text-brand' : 'text-subtle hover:bg-sand hover:text-brand'}`}
              >
                <Icon name={item.icon} className="!h-[18px] !w-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto p-5">
          <div className="rounded-[13px] border border-line bg-canvas p-4 text-[11px] leading-relaxed text-muted">
            <Icon name={tip.icon} className="text-stat-icon" />
            <strong className="mt-3 block text-[12px] font-[550] text-label">{tip.title}</strong>
            {tip.body}
          </div>
          <div className="mt-4 flex items-center gap-2.5 px-1">
            <WorkspaceProfileAvatar person={person} size={34} />
            <span className="text-[12px] leading-tight">
              <strong className="block font-[550] text-label">{person.name}</strong>
              <span className="text-[11px] text-subtle">{person.role}</span>
            </span>
          </div>
        </div>
      </aside>

      {sunset ? (
        <MobileHeader
          breakpoint="lg"
          leading={<StudentBrand subtitle={brandSubtitle} />}
          trailing={
            <span className="flex items-center gap-2">
              {alertsHref ? (
                <Link href={alertsHref} aria-label="Abrir notificações"
                  className="press relative grid h-10 w-10 place-items-center rounded-full text-ink">
                  <Icon name="bell" className="!h-6 !w-6"/>
                  {unread>0 ? <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{unread>9?'9+':unread}</span> : null}
                </Link>
              ) : null}
              <WorkspaceProfileAvatar person={person} size={40} />
            </span>
          }
        />
      ) : (
        <MobileHeader
          breakpoint="lg"
          leading={<LogoMark />}
          title={current?.label ?? workspaceTitle}
          trailing={<WorkspaceProfileAvatar person={person} size={36} />}
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="hidden h-[76px] items-center justify-between border-b border-line bg-chrome px-9 lg:flex">
          <p className="flex items-center gap-2 text-[11px] text-muted">
            <span>{workspaceTitle}</span>
            <Icon name="chevron" className="!h-3.5 !w-3.5" />
            <strong className="font-[550] text-label">{current?.label ?? ''}</strong>
          </p>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              <Icon name="pin" className="!h-4 !w-4" /> Preá, Ceará
            </span>
            {alertsHref ? (
              <Link href={alertsHref} aria-label="Abrir notificações"
                className="press relative grid h-10 w-10 place-items-center rounded-full border border-line text-label">
                <Icon name="bell"/>
                {unread>0 ? <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{unread>9?'9+':unread}</span> : null}
              </Link>
            ) : null}
            <WorkspaceProfileAvatar person={person} size={36} />
          </div>
        </div>
        <main className="mx-auto max-w-6xl px-4 pb-tabbar pt-4 sm:px-6 lg:px-9 lg:py-9">{children}</main>
      </div>

      <TabBar
        breakpoint="lg"
        label={workspace}
        variant={sunset ? 'underline' : 'pill'}
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
  { label: 'Meu perfil', href: '/pousada/perfil', icon: 'user' },
] as const satisfies readonly TabItem[];

const PARTNER_MENU: readonly SheetLink[] = [
  { label: 'Central da pousada', href: '/pousada/central', icon: 'grid' },
  { label: 'Meu perfil', href: '/pousada/perfil', icon: 'user' },
  { label: 'Cadastro inicial', href: '/pousada/cadastro', icon: 'file' },
];

function PartnerHeaderAvatar({ partner, size = 40 }: {
  partner: { name:string; initials:string; photoUrl?:string|null };
  size?:number;
}) {
  return (
    <Link href="/pousada/perfil" aria-label="Abrir meu perfil da pousada" title="Meu perfil"
      className="press inline-grid shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
      {partner.photoUrl ? (
        <span className="overflow-hidden rounded-full border border-line-ghost bg-sand"
          style={{width:size,height:size}}>
          <img src={partner.photoUrl} alt="" className="h-full w-full object-cover"/>
        </span>
      ) : <Avatar initials={partner.initials} size={size}/>}
    </Link>
  );
}

export function PartnerShell({
  children,
  partner,
  signOut,
  areas,
}: {
  children: React.ReactNode;
  partner: { name: string; initials: string; photoUrl?:string|null };
  signOut: () => Promise<void>;
  areas?: readonly { label: string; href: string }[];
}) {
  const pathname = usePathname();
  return (
    <div className="theme-sunset min-h-dvh bg-canvas text-ink">
      <header className="hidden border-b border-line bg-chrome md:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-8 py-4">
          <StudentBrand subtitle="Pousada parceira" />
          <div className="flex items-center gap-2.5">
            <PartnerHeaderAvatar partner={partner} size={40}/>
            <span className="text-[12px] leading-tight">
              <strong className="block font-[550] text-ink">{partner.name}</strong>
              <span className="text-[11px] text-muted">Pousada parceira</span>
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
                className={`shrink-0 border-b-2 pb-3 text-[14px] ${active ? 'border-brand font-[550] text-brand' : 'border-transparent text-muted hover:text-ink'}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <MobileHeader
        leading={<StudentBrand subtitle="Pousada" />}
        trailing={<PartnerHeaderAvatar partner={partner} size={42}/>} 
      />
      <main className="mx-auto max-w-6xl px-4 pb-tabbar pt-4 md:px-8 md:pb-0 md:pt-7">{children}</main>
      <SiteFooter />
      <TabBar
        label="Área da pousada"
        variant="underline"
        items={PARTNER_NAV.slice(0, 3)}
        more={{
          title: 'Pousada parceira',
          links: PARTNER_MENU,
          footer: <SheetAccount name={partner.name} subtitle="Pousada parceira" initials={partner.initials} signOut={signOut} areas={areas} />,
        }}
      />
    </div>
  );
}
