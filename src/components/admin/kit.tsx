import Link from 'next/link';

import { Icon, type IconName } from '../icon';

/**
 * Workspace building blocks (Instrutor and Admin): page title, metric cards,
 * charts, list cards and quick-access tiles. Colours come from the theme
 * tokens, so the same markup follows whichever theme wraps it. Values arrive
 * computed; the charts only draw them.
 */

export function AdminTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 lg:mb-6">
      <div className="min-w-0">
        <h1 className="text-[24px] font-bold leading-tight tracking-[-0.5px] text-ink lg:text-[26px]">{title}</h1>
        {subtitle ? <p className="mt-1 text-[14px] leading-snug text-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

/** A small primary pill button for the title's right side ("+ Nova praia"). */
export function TitleAction({ href, label, icon = 'plus' }: { href: string; label: string; icon?: IconName }) {
  return (
    <Link href={href} className="btn-primary press inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 !text-[13px] text-white">
      <Icon name={icon} className="!h-4 !w-4" />
      {label}
    </Link>
  );
}

/**
 * Icon-square tints. "slate" and "sky" are the workspace's neutrals; "orange"
 * and "purple" remain for the partner area's dark theme. The colours live in
 * globals.css (.vk-tone-*), one set per theme.
 */
export type Tone = 'blue' | 'green' | 'slate' | 'sky' | 'orange' | 'purple';

export const TONE_CLASSES: Readonly<Record<Tone, string>> = {
  blue: 'vk-tone-blue',
  green: 'vk-tone-green',
  slate: 'vk-tone-slate',
  sky: 'vk-tone-sky',
  orange: 'vk-tone-orange',
  purple: 'vk-tone-purple',
};

export function IconSquare({ icon, tone, size = 40 }: { icon: IconName; tone: Tone; size?: number }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-[11px] ${TONE_CLASSES[tone]}`} style={{ width: size, height: size }} aria-hidden="true">
      <Icon name={icon} className="!h-5 !w-5" />
    </span>
  );
}

export function Metric({
  label,
  value,
  hint,
  hintTone = 'muted',
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  hintTone?: 'muted' | 'brand' | 'success';
  icon: IconName;
  tone: Tone;
}) {
  const hintClass = hintTone === 'brand' ? 'text-brand' : hintTone === 'success' ? 'text-success' : 'text-muted';
  return (
    <article className="rounded-[16px] border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium leading-snug text-muted">{label}</p>
        <IconSquare icon={icon} tone={tone} size={34} />
      </div>
      <p className="tabular mt-1.5 text-[24px] font-bold leading-tight tracking-[-0.5px] text-ink lg:text-[26px]">{value}</p>
      {hint ? <p className={`mt-1.5 text-[12px] font-medium ${hintClass}`}>{hint}</p> : null}
    </article>
  );
}

export function Panel({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[16px] border border-line bg-surface p-4 shadow-card sm:p-5 ${className}`}>
      {title ? (
        <div className="mb-3.5 flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function PanelLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
      {label} <Icon name="chevron" className="!h-4 !w-4" />
    </Link>
  );
}

interface Point {
  label: string;
  value: number;
}

/**
 * Brand line over a soft area, with dots; the highest point gets a value
 * bubble. The plot stretches to its panel while labels and dots keep their
 * size, so it reads the same on a phone and on a wide screen.
 */
export function LineChart({ points, unit }: { points: readonly Point[]; unit: string }) {
  const max = Math.max(1, ...points.map((point) => point.value));
  const x = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * 100 : 50);
  const y = (value: number) => 100 - (value / max) * 100;
  const peak = points.reduce((best, point, i) => (point.value > (points[best]?.value ?? -1) ? i : best), 0);
  const line = points.map((point, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(point.value).toFixed(2)}`).join(' ');
  const area = points.length > 1 ? `${line} L${x(points.length - 1).toFixed(2)},100 L${x(0).toFixed(2)},100 Z` : '';
  const ticks = [...new Set([max, Math.round(max / 2), 0])];
  const bubbleShift = peak === 0 ? '-translate-x-[14px]' : peak === points.length - 1 ? '-translate-x-[calc(100%-14px)]' : '-translate-x-1/2';

  return (
    <div role="img" aria-label={points.map((p) => `${p.label}: ${p.value} ${unit}`).join(', ')} className="pt-8">
      <div className="relative ml-8 mr-4 h-36 lg:h-44">
        {ticks.map((tick) => (
          <span key={tick} className="absolute -left-8 right-0 flex -translate-y-1/2 items-center gap-2" style={{ top: `${y(tick)}%` }}>
            <span className="tabular w-6 shrink-0 text-right text-[11px] leading-none text-muted">{tick}</span>
            <span className="h-px flex-1 border-t border-dashed border-line" />
          </span>
        ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          {area ? <path d={area} fill="var(--color-brand)" opacity="0.08" /> : null}
          <path d={line} fill="none" stroke="var(--color-brand)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {points.map((point, i) => (
          <span key={point.label} className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-brand"
            style={{ left: `${x(i)}%`, top: `${y(point.value)}%` }} />
        ))}
        {points[peak] && points[peak].value > 0 ? (
          <span className={`tabular absolute whitespace-nowrap rounded-full bg-ink px-2 py-1 text-[11px] font-semibold leading-none text-surface ${bubbleShift}`}
            style={{ left: `${x(peak)}%`, top: `calc(${y(points[peak].value)}% - 30px)` }}>
            {points[peak].value} {unit}
          </span>
        ) : null}
      </div>
      <div className="relative ml-8 mr-4 mt-3 h-4" aria-hidden="true">
        {points.map((point, i) => (
          <span key={point.label} className="tabular absolute -translate-x-1/2 whitespace-nowrap text-[11px] leading-none text-muted" style={{ left: `${x(i)}%` }}>
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Brand bars; `describe` turns a value into its label for the accessible name. */
export function BarChart({ points, describe }: { points: readonly Point[]; describe: (value: number) => string }) {
  const max = Math.max(1, ...points.map((point) => point.value));
  return (
    <div className="flex h-36 items-end gap-2.5" role="img" aria-label={points.map((p) => `${p.label}: ${describe(p.value)}`).join(', ')}>
      {points.map((point) => (
        <div key={point.label} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex h-28 w-full items-end">
            <div
              className={`w-full rounded-t-[6px] ${point.value > 0 ? 'bg-brand-bar' : 'bg-track'}`}
              style={{ height: `${point.value > 0 ? Math.max(6, Math.round((point.value / max) * 100)) : 4}%` }}
            />
          </div>
          <span className="tabular text-[10px] text-muted">{point.label}</span>
        </div>
      ))}
    </div>
  );
}

export function QuickTile({ href, label, icon, tone }: { href: string; label: string; icon: IconName; tone: Tone }) {
  return (
    <Link href={href} className="press flex h-full flex-col items-center gap-2 rounded-[14px] border border-line bg-surface px-2 py-4 text-center text-[12.5px] font-medium leading-tight text-label shadow-card transition-colors hover:border-brand-focus hover:text-ink">
      <IconSquare icon={icon} tone={tone} size={42} />
      {label}
    </Link>
  );
}

/** Tappable row-card with a chevron, for lists of instructors, bookings, beaches. */
export function ListCard({ href, children }: { href?: string; children: React.ReactNode }) {
  const body = (
    <>
      <div className="min-w-0 flex-1">{children}</div>
      <Icon name="chevron" className="!h-5 !w-5 shrink-0 text-muted" />
    </>
  );
  return href ? (
    <Link href={href} className="press flex items-center gap-3 rounded-[16px] border border-line bg-surface p-3.5 shadow-card transition-colors hover:border-brand-focus">{body}</Link>
  ) : (
    <div className="flex items-center gap-3 rounded-[16px] border border-line bg-surface p-3.5 shadow-card">{body}</div>
  );
}

/** Initials on a brand tile, standing in for a profile photo. */
export function PhotoTile({ initials, size = 64 }: { initials: string; size?: number }) {
  return (
    <span
      className="vk-photo-fallback grid shrink-0 place-items-center rounded-[14px] font-bold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size / 3) }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

/** A beach thumbnail without a photo: sea, sand and a pin. */
export function BeachTile({ size = 64 }: { size?: number }) {
  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-[14px] bg-[linear-gradient(180deg,#5cc3e8_0%,#2a8fb8_55%,#e9d3a0_56%,#d9b97a_100%)]"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Icon name="pin" className="!h-6 !w-6 text-white drop-shadow" />
    </span>
  );
}

/** A hub page: every link of a workspace as tiles under its menu section. */
export function HubSections({
  sections,
}: {
  sections: readonly { title: string; items: readonly { label: string; href: string; icon: IconName }[] }[];
}) {
  const tones: readonly Tone[] = ['blue', 'slate', 'sky', 'green'];
  return (
    <div className="grid gap-6">
      {sections.map((section, index) => (
        <section key={section.title} aria-label={section.title}>
          <h2 className="mb-2.5 text-[11.5px] font-semibold uppercase tracking-[.1em] text-subtle">{section.title}</h2>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
            {section.items.map((item) => (
              <QuickTile key={item.href} href={item.href} label={item.label} icon={item.icon} tone={tones[index % tones.length] ?? 'blue'} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
