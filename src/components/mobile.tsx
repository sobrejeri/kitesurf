'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Icon, type IconName } from './icon';
import { StudentProfileAvatar } from './student/profile-avatar';
import { isActive } from '@/lib/navigation-state';
import { modalFocusDestination } from '@/lib/modal-focus';
export { isActive } from '@/lib/navigation-state';

/**
 * Phone chrome: a compact header, a tab bar and a "Mais" sheet. Shown below
 * the desktop breakpoint of each shell; the desktop layout stays as it was.
 */

export interface TabItem {
  label: string;
  href: string;
  icon: IconName;
  /** Other routes that keep this tab highlighted. */
  match?: readonly string[];
}

export interface SheetLink {
  label: string;
  href: string;
  icon: IconName;
  /** Unread or pending items waiting behind this link. */
  count?: number;
}

/** A titled section of the "Mais" sheet (staff workspaces). */
export interface SheetGroup {
  title: string;
  links: readonly SheetLink[];
}

export function MobileHeader({
  title,
  leading,
  trailing,
  breakpoint = 'md',
  tone = 'chrome',
}: {
  title?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  breakpoint?: 'md' | 'lg';
  /** "navy": the dark staff app bar that carries the white logo. */
  tone?: 'chrome' | 'navy';
}) {
  return (
    <header
      className={`pt-safe sticky top-0 z-30 backdrop-blur-xl ${tone === 'navy' ? 'vk-chrome vk-appbar' : 'border-b border-line/80 bg-chrome/90'} ${breakpoint === 'md' ? 'md:hidden' : 'lg:hidden'}`}
    >
      {/* Content-sized: the two-line brand (logo + area label) is ~70px tall. */}
      <div className="flex min-h-14 items-center gap-3 px-4 py-1">
        {leading}
        {title ? <p className="min-w-0 flex-1 truncate text-[16px] font-semibold tracking-[-0.3px]">{title}</p> : <span className="flex-1" />}
        {trailing}
      </div>
    </header>
  );
}

export function TabBar({
  items,
  more,
  center,
  breakpoint = 'md',
  label,
  variant = 'pill',
}: {
  items: readonly TabItem[];
  more?: { links: readonly SheetLink[]; groups?: readonly SheetGroup[]; footer?: React.ReactNode; title: string };
  /** A highlighted call-to-action placed in the middle of the bar (e.g. "Agendar"). */
  center?: TabItem;
  breakpoint?: 'md' | 'lg';
  label: string;
  /** "underline": rounded dark bar with an orange underline (sunset theme). */
  variant?: 'pill' | 'underline';
}) {
  const pathname = usePathname();
  // The sheet belongs to the page it was opened on: navigating closes it.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const closeSheet = useCallback(() => setOpenAt(null), []);
  const mid = Math.ceil(items.length / 2);
  const centerActive = Boolean(center && isActive(pathname, center));
  const moreActive = Boolean(more) && !centerActive && !items.some(item => isActive(pathname, item));

  const renderItem = (item: TabItem) => {
    // When Agendar is open, do not highlight Explorar through its match route.
    const active = !centerActive && isActive(pathname, item);
    return (
      <li key={item.href} className="flex-1">
        <Link
          href={item.href}
          aria-current={active ? 'page' : undefined}
          className={`press flex flex-col items-center gap-0.5 py-1 ${variant === 'underline' ? 'text-[11px]' : 'text-[11px]'} ${active ? `font-[600] ${variant === 'underline' ? 'text-sunrise' : 'text-brand'}` : 'text-tabbar-ink'}`}
        >
          <span className={`grid h-8 w-14 place-items-center rounded-full transition-colors ${active && variant === 'pill' ? 'bg-brand-soft' : ''}`}>
            <Icon name={item.icon} className={`!h-[22px] !w-[22px] ${active ? '[stroke-width:1.9]' : ''}`} />
          </span>
          {item.label}
          {variant === 'underline' ? (
            <span className={`mt-1 h-[3px] w-8 rounded-full ${active ? 'bg-brand' : 'bg-transparent'}`} aria-hidden="true" />
          ) : null}
        </Link>
      </li>
    );
  };

  return (
    <>
      <nav
        aria-label={label}
        className={`vento-student-single-tabbar pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-tabbar/95 backdrop-blur-xl ${variant === 'underline' ? 'rounded-t-[26px] shadow-[0_-10px_30px_#00000059]' : ''} ${breakpoint === 'md' ? 'md:hidden' : 'lg:hidden'}`}
      >
        <ul className={`mx-auto flex max-w-lg items-stretch justify-around px-1 ${variant === 'underline' ? 'pt-3' : 'pt-1.5'}`}>
          {(center ? items.slice(0, mid) : items).map(renderItem)}
          {center ? (
            <li className="flex-1">
              <Link
                href={center.href}
                aria-label={center.label}
                aria-current={centerActive ? 'page' : undefined}
                className={`press flex flex-col items-center gap-1 py-1 ${centerActive ? 'text-sunrise font-semibold' : 'text-tabbar-ink'}`}
              >
                <span className={`-mt-[22px] grid h-[52px] w-[52px] place-items-center rounded-full border-[5px] border-[#023141] transition-colors ${centerActive ? 'bg-[#baff08] text-[#002b3b] shadow-[0_9px_22px_#baff0870]' : 'bg-[#0b3a4e] text-[#c5d7e1] shadow-none'}`}>
                  <Icon name={center.icon} className="!h-[25px] !w-[25px] [stroke-width:2]" />
                </span>
                <span className={`${variant === 'underline' ? 'text-[11px]' : 'text-[10px]'} font-[650] ${centerActive ? 'text-sunrise' : 'text-tabbar-ink'}`}>{center.label}</span>
                {variant === 'underline' ? <span className={`mt-1 h-[3px] w-8 rounded-full ${centerActive ? 'bg-brand' : 'bg-transparent'}`} aria-hidden="true" /> : null}
              </Link>
            </li>
          ) : null}
          {center ? items.slice(mid).map(renderItem) : null}
          {more ? (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setOpenAt((current) => current === pathname ? null : pathname)}
                aria-haspopup="dialog"
                aria-expanded={open}
                className={`press flex w-full flex-col items-center gap-0.5 py-1 ${variant === 'underline' ? 'text-[11px]' : 'text-[11px]'} ${moreActive ? `font-[600] ${variant === 'underline' ? 'text-sunrise' : 'text-brand'}` : 'text-tabbar-ink'}`}
              >
                <span className={`grid h-8 w-14 place-items-center rounded-full ${moreActive && variant === 'pill' ? 'bg-brand-soft' : ''}`}>
                  <Icon name="grid" className="!h-[22px] !w-[22px]" />
                </span>
                Mais
                {variant === 'underline' ? (
                  <span className={`mt-1 h-[3px] w-8 rounded-full ${moreActive ? 'bg-brand' : 'bg-transparent'}`} aria-hidden="true" />
                ) : null}
              </button>
            </li>
          ) : null}
        </ul>
      </nav>
      {more ? <MoreSheet open={open} onClose={closeSheet} {...more} /> : null}
    </>
  );
}

/** A header button (☰) that opens the menu sheet. */
export function MenuButton({
  title,
  links,
  footer,
  label = 'Abrir menu',
  onPhoto = false,
  className = '',
  studentStyle = false,
}: {
  title: string;
  links: readonly SheetLink[];
  footer?: React.ReactNode;
  studentStyle?: boolean;
  label?: string;
  /** Over a photo: white icon on a dark frosted circle. */
  onPhoto?: boolean;
  /** Extra classes for the trigger button (e.g. pointer-events-auto). */
  className?: string;
}) {
  const pathname = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const closeSheet = useCallback(() => setOpenAt(null), []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpenAt((current) => current === pathname ? null : pathname)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        className={`press grid h-11 w-11 place-items-center rounded-full ${onPhoto ? 'bg-[#0b2a4a]/45 text-white backdrop-blur' : 'text-ink'} ${className}`}
      >
        <Icon name="menu" className="!h-6 !w-6" />
      </button>
      <MoreSheet open={open} onClose={closeSheet} title={title} links={links} footer={footer} studentStyle={studentStyle} />
    </>
  );
}

/** Bottom sheet with the rest of the menu. Closes on Esc or a backdrop tap. */
function MoreSheet({
  open,
  onClose,
  title,
  links,
  groups,
  footer,
  studentStyle = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  links: readonly SheetLink[];
  /** When given, the sheet lists these titled sections instead of the tile grid. */
  groups?: readonly SheetGroup[];
  footer?: React.ReactNode;
  studentStyle?: boolean;
}) {
  const pathname = usePathname();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel.current) return;
      const focusable = Array.from(
        panel.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(element => element.getClientRects().length > 0);
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const destination = modalFocusDestination(
        event.shiftKey ? 'backward' : 'forward',
        currentIndex,
        focusable.length,
        document.activeElement === panel.current,
      );
      if (destination !== null) {
        event.preventDefault();
        if (destination === -1) panel.current.focus();
        else focusable[destination]?.focus();
      }
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  // The menu trigger sits inside a click-through header
  // (pointer-events: none). Portaling the sheet to document.body removes
  // that inherited hit-testing constraint and places it ABOVE the tab bar.
  return createPortal(
    <div className={`pointer-events-auto fixed inset-0 ${studentStyle ? 'z-[300] vento-student-menu' : 'z-[70]'} lg:hidden`} role="presentation">
      <button type="button" aria-label="Fechar menu" onClick={onClose} className="sheet-backdrop absolute inset-0 bg-[#1b2433]/40" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="sheet-panel pb-safe absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[24px] bg-surface px-4 pt-2 shadow-[0_-12px_40px_#1b243326] focus:outline-none"
      >
        <span className={`mx-auto mb-3 block h-1 w-10 rounded-full bg-line-ghost ${studentStyle ? 'vento-student-menu-grip' : ''}`} aria-hidden="true" />
        <div className="flex items-center justify-between gap-3 px-1">
          <p id={titleId} className="text-[16px] font-semibold">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className={`press inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-3 text-[13px] font-semibold text-brand ${studentStyle ? 'vento-student-menu-close' : ''}`}
          >
            Fechar <span className="text-xl leading-none" aria-hidden="true">×</span>
          </button>
        </div>
        {groups ? (
          <div className="mt-4 grid gap-4">
            {groups.map((group) => (
              <section key={group.title} aria-label={group.title}>
                <h3 className="px-1.5 pb-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-subtle">{group.title}</h3>
                <ul className="overflow-hidden rounded-[14px] bg-sand">
                  {group.links.map((link) => {
                    const active = isActive(pathname, link);
                    return (
                      <li key={link.href} className="border-b border-surface last:border-b-0">
                        <Link
                          href={link.href}
                          onClick={onClose}
                          aria-current={active ? 'page' : undefined}
                          className={`flex min-h-[50px] items-center gap-3 px-3 text-[14px] active:bg-backdrop ${active ? 'font-semibold text-brand' : 'font-medium text-ink'}`}
                        >
                          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[9px] ${active ? 'bg-brand text-on-brand' : 'bg-surface text-brand'}`} aria-hidden="true">
                            <Icon name={link.icon} className="!h-[18px] !w-[18px]" />
                          </span>
                          <span className="min-w-0 flex-1 truncate">{link.label}</span>
                          {link.count ? (
                            <span className="tabular rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-on-brand">{link.count > 9 ? '9+' : link.count}</span>
                          ) : null}
                          <Icon name="chevron" className="!h-4 !w-4 shrink-0 text-faint" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        ) : (
        <ul className={`mt-4 grid grid-cols-3 gap-2.5 ${studentStyle ? 'vento-student-menu-grid' : ''}`}>
          {links.map((link) => {
            const active = isActive(pathname, link);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={onClose}
                  aria-current={active ? 'page' : undefined}
                  className={studentStyle
                    ? 'vento-student-menu-link press flex h-full flex-col items-center gap-1.5 text-center'
                    : `press flex h-full flex-col items-center gap-2 rounded-search border px-2 py-3.5 text-center text-[11px] leading-tight ${active ? 'border-brand-focus bg-brand-soft font-[550] text-brand' : 'border-line bg-canvas text-label'}`}
                >
                  {studentStyle ? (
                    <>
                      <span className={`vento-student-menu-tile ${active ? 'vento-student-menu-tile--active' : ''}`} aria-hidden="true">
                        <Icon name={link.icon} className="vento-student-menu-icon" />
                      </span>
                      <span className="vento-student-menu-label">{link.label}</span>
                    </>
                  ) : (
                    <>
                      <Icon name={link.icon} className="!h-[22px] !w-[22px] text-brand" />
                      {link.label}
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        )}
        {footer ? <div className={`mt-4 border-t border-line pt-4 pb-2 ${studentStyle ? 'vento-student-menu-footer' : ''}`}>{footer}</div> : <div className="h-4" />}
      </div>
    </div>,
    document.body,
  );
}

/** Account block for the bottom of the "Mais" sheet. */
export function SheetAccount({
  name,
  subtitle,
  initials,
  photoUrl,
  signOut,
  areas,
}: {
  name: string;
  subtitle: string;
  initials: string;
  /** Same authenticated profile photo used in the student's desktop header. */
  photoUrl?: string | null;
  signOut: () => Promise<void>;
  areas?: readonly { label: string; href: string }[];
}) {
  return (
    <div className="grid gap-3">
      {areas && areas.length > 1 ? (
        <div className="flex gap-1 rounded-[13px] bg-sand p-1 text-[12px]">
          {areas.map((area) => (
            <Link key={area.href} href={area.href} className="press flex-1 rounded-[10px] py-2 text-center text-label">
              {area.label}
            </Link>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-3">
        {photoUrl ? (
          <StudentProfileAvatar name={name} initials={initials} photoUrl={photoUrl} />
        ) : (
          <span className="grid h-10 w-10 place-items-center rounded-full bg-avatar-1 text-[13px] font-[550] text-avatar-1-ink" aria-hidden="true">
            {initials}
          </span>
        )}
        <span className="min-w-0 flex-1 text-[13px] leading-tight">
          <strong className="block truncate font-[550]">{name}</strong>
          <span className="text-[11px] text-muted">{subtitle}</span>
        </span>
        <form action={signOut}>
          <button type="submit" className="press rounded-full border border-line px-4 py-2 text-[12px] font-[550] text-danger">
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}
