'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Icon } from '@/components/icon';
import { Logo } from '@/components/shells';
import { COMPANY, NOTIFICATIONS, UNITS } from '@/lib/business/demo';

import { BUSINESS_NAV } from './nav';

/** City and unit selection, kept in the URL so every screen filters the same way. */
function ScopeSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const cidade = params.get('cidade') ?? '';
  const unidade = params.get('unidade') ?? '';
  const cities = [...new Set(UNITS.map((u) => u.city))].sort();
  const unit = UNITS.find((u) => u.id === unidade);
  const activeCity = unit?.city ?? cidade;
  const units = UNITS.filter((u) => !activeCity || u.city === activeCity);
  const go = (next: { cidade?: string; unidade?: string }) => {
    const q = new URLSearchParams();
    if (next.unidade) q.set('unidade', next.unidade);
    else if (next.cidade) q.set('cidade', next.cidade);
    const s = q.toString();
    router.push(s ? `${pathname}?${s}` : pathname);
  };
  const base = 'min-h-10 min-w-0 rounded-[10px] border border-line-input bg-surface px-2.5 text-[13px] text-ink';
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="hidden min-w-0 truncate text-[13px] font-semibold text-ink xl:block">{COMPANY.name}</span>
      <label className="sr-only" htmlFor="biz-city">Cidade</label>
      <select id="biz-city" className={`${base} min-w-0 flex-1 sm:max-w-[200px]`} value={activeCity}
        onChange={(e) => go({ cidade: e.target.value })}>
        <option value="">Todas as cidades</option>
        {cities.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <label className="sr-only" htmlFor="biz-unit">Unidade</label>
      <select id="biz-unit" className={`${base} min-w-0 flex-1 sm:max-w-[220px]`} value={unidade}
        onChange={(e) => go(e.target.value ? { unidade: e.target.value } : { cidade: activeCity })}>
        <option value="">Todas as unidades</option>
        {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
    </div>
  );
}

function useScopeQuery() {
  const params = useSearchParams();
  const q = new URLSearchParams();
  const unidade = params.get('unidade');
  const cidade = params.get('cidade');
  if (unidade) q.set('unidade', unidade); else if (cidade) q.set('cidade', cidade);
  const s = q.toString();
  return s ? `?${s}` : '';
}

function Notifications() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={`Notificações (${NOTIFICATIONS.length})`}
        className="press relative grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-label hover:bg-brand-wash">
        <Icon name="bell" className="!h-5 !w-5" />
        <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-on-brand">{NOTIFICATIONS.length}</span>
      </button>
      {open ? (
        <div role="dialog" aria-label="Notificações" className="absolute right-0 top-12 z-50 w-[min(320px,calc(100vw-32px))] rounded-[14px] border border-line bg-surface p-2 shadow-card">
          <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[1.4px] text-muted">Demonstrativo</p>
          {NOTIFICATIONS.map((n) => (
            <Link key={n.id} href={n.href} onClick={() => setOpen(false)} className="block rounded-[10px] px-2 py-2.5 text-[13px] text-ink hover:bg-brand-wash">{n.text}</Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const isActive = (pathname: string, href: string) => (href === '/admin/business' ? pathname === href : pathname.startsWith(href));

export function BusinessShell({ children, person }: { children: React.ReactNode; person: { name: string; initials: string } }) {
  const pathname = usePathname();
  const scope = useScopeQuery();
  const [collapsed, setCollapsed] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem('vento-business-collapsed') === '1'); } catch { /* storage may be blocked */ }
  }, []);
  useEffect(() => { setMore(false); }, [pathname]);
  const toggle = () => setCollapsed((v) => {
    try { localStorage.setItem('vento-business-collapsed', v ? '0' : '1'); } catch { /* ignore */ }
    return !v;
  });
  const groups = [...new Set(BUSINESS_NAV.map((i) => i.group))];
  const tabs = BUSINESS_NAV.filter((i) => i.tab);
  const rest = BUSINESS_NAV.filter((i) => !i.tab);

  return (
    <div className="theme-pro flex min-h-dvh bg-canvas text-ink">
      <aside aria-label="Menu do Business" className={`print:!hidden vk-chrome hidden shrink-0 flex-col transition-[width] duration-200 lg:sticky lg:top-0 lg:flex lg:h-dvh ${collapsed ? 'lg:w-[76px]' : 'lg:w-[248px]'}`}>
        <div className={`flex h-16 items-center ${collapsed ? 'justify-center' : 'justify-between px-4'}`}>
          {collapsed ? null : <Logo size="sm" />}
          <button type="button" onClick={toggle} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'} aria-pressed={collapsed}
            className="press grid h-9 w-9 place-items-center rounded-[10px] text-white/80 hover:bg-white/10">
            <Icon name="menu" className="!h-5 !w-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {groups.map((g) => (
            <div key={g} className="mt-3">
              {collapsed ? <hr className="mx-2 my-2 border-white/10" /> : <p className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[1.6px] text-white/50">{g}</p>}
              {BUSINESS_NAV.filter((i) => i.group === g).map((i) => {
                const on = isActive(pathname, i.href);
                return (
                  <Link key={i.href} href={`${i.href}${scope}`} title={collapsed ? i.label : undefined} aria-current={on ? 'page' : undefined}
                    className={`press mb-0.5 flex min-h-10 items-center gap-3 rounded-[10px] px-3 text-[14px] ${collapsed ? 'justify-center' : ''} ${on ? 'bg-brand font-semibold text-on-brand' : 'text-white/80 hover:bg-white/10'}`}>
                    <Icon name={i.icon} className="!h-5 !w-5 shrink-0" />
                    {collapsed ? <span className="sr-only">{i.label}</span> : i.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <Link href="/admin/visao" className={`mx-3 mb-4 flex min-h-10 items-center gap-3 rounded-[10px] px-3 text-[13px] text-white/70 hover:bg-white/10 ${collapsed ? 'justify-center' : ''}`} title="Voltar ao Admin">
          <Icon name="back" className="!h-5 !w-5 shrink-0" />{collapsed ? <span className="sr-only">Voltar ao Admin</span> : 'Voltar ao Admin'}
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="print:hidden sticky top-0 z-40 flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-chrome px-3 py-2 sm:flex-nowrap sm:px-5">
          <span className="vk-chrome shrink-0 rounded-[12px] px-2.5 py-1 lg:hidden"><Logo size="sm" /></span>
          <span className="ml-auto sm:hidden" />
          <div className="order-last w-full sm:order-none sm:w-auto sm:min-w-0 sm:flex-1"><ScopeSelector /></div>
          <Notifications />
          <span className="hidden h-10 w-10 place-items-center rounded-full bg-brand-soft text-[13px] font-bold text-brand sm:grid" title={person.name} aria-label={`Conta: ${person.name}`}>{person.initials}</span>
        </header>
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-3 pb-28 pt-5 sm:px-5 lg:pb-10">{children}</main>
      </div>

      <nav aria-label="Navegação do Business" className="print:hidden fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {tabs.map((i) => {
            const on = isActive(pathname, i.href);
            return (
              <li key={i.href}>
                <Link href={`${i.href}${scope}`} aria-current={on ? 'page' : undefined} className={`press flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${on ? 'font-semibold text-brand' : 'text-muted'}`}>
                  <Icon name={i.icon} className="!h-5 !w-5" />{i.label === 'Funcionários' ? 'Equipe' : i.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" className="press flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] text-muted">
              <Icon name="grid" className="!h-5 !w-5" />Mais
            </button>
          </li>
        </ul>
      </nav>

      {more ? (
        <div role="dialog" aria-modal="true" aria-label="Mais opções" className="fixed inset-0 z-50 flex items-end bg-black/50 lg:hidden" onClick={() => setMore(false)}>
          <div className="max-h-[80dvh] w-full overflow-y-auto rounded-t-[22px] bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[16px] font-semibold">Mais opções</h2>
              <button type="button" onClick={() => setMore(false)} aria-label="Fechar" className="press grid h-10 w-10 place-items-center rounded-full hover:bg-brand-wash"><Icon name="close" className="!h-5 !w-5" /></button>
            </div>
            <ul className="grid gap-1">
              {rest.map((i) => (
                <li key={i.href}><Link href={`${i.href}${scope}`} className="press flex min-h-12 items-center gap-3 rounded-[12px] px-3 text-[14px] text-ink hover:bg-brand-wash"><Icon name={i.icon} className="!h-5 !w-5 text-brand" />{i.label}</Link></li>
              ))}
              <li><Link href="/admin/visao" className="press flex min-h-12 items-center gap-3 rounded-[12px] px-3 text-[14px] text-ink hover:bg-brand-wash"><Icon name="back" className="!h-5 !w-5 text-brand" />Voltar ao Admin</Link></li>
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
