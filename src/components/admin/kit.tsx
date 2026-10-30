import Link from 'next/link';

import { Icon, type IconName } from '../icon';

/**
 * Admin building blocks for the sunset look: page title, metric cards,
 * charts, list cards and quick-access tiles. Values arrive computed; the
 * charts only draw them.
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
    <header className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.8px] text-ink md:text-[34px]">{title}</h1>
        {subtitle ? <p className="mt-1 text-[14px] text-label">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0 pt-1">{action}</div> : null}
    </header>
  );
}

/** A small orange pill button for the title's right side ("+ Nova praia"). */
export function TitleAction({ href, label, icon = 'plus' }: { href: string; label: string; icon?: IconName }) {
  return (
    <Link href={href} className="btn-primary press inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 !text-[13px] text-white">
      <Icon name={icon} className="!h-4 !w-4" />
      {label}
    </Link>
  );
}

export type Tone = 'blue' | 'orange' | 'green' | 'purple';

export const TONE_CLASSES: Readonly<Record<Tone, string>> = {
  blue: 'bg-[#3b6cf6]/20 text-[#8fb0ff]',
  orange: 'bg-brand/20 text-brand',
  green: 'bg-[#22c55e]/18 text-[#5fd39a]',
  purple: 'bg-[#8b5cf6]/22 text-[#c4b0ff]',
};

export function IconSquare({ icon, tone, size = 40 }: { icon: IconName; tone: Tone; size?: number }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-[12px] ${TONE_CLASSES[tone]}`} style={{ width: size, height: size }} aria-hidden="true">
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
    <article className="rounded-[18px] border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] leading-snug text-label">{label}</p>
        <IconSquare icon={icon} tone={tone} size={36} />
      </div>
      <p className="tabular mt-2 text-[28px] font-bold leading-none tracking-[-0.6px] text-ink">{value}</p>
      {hint ? <p className={`mt-2 text-[12px] font-medium ${hintClass}`}>{hint}</p> : null}
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
    <section className={`rounded-[20px] border border-line bg-surface p-4 sm:p-5 ${className}`}>
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function PanelLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-1 text-[13px] font-medium text-[#8fb0ff]">
      {label} <Icon name="chevron" className="!h-4 !w-4" />
    </Link>
  );
}

interface Point {
  label: string;
  value: number;
}

/** Orange line with dots; the highest point gets a value bubble. */
export function LineChart({ points, unit }: { points: readonly Point[]; unit: string }) {
  const width = 320;
  const height = 150;
  const left = 22;
  const bottom = 22;
  const top = 26;
  const max = Math.max(1, ...points.map((point) => point.value));
  const step = points.length > 1 ? (width - left - 20) / (points.length - 1) : 0;
  const x = (i: number) => left + i * step;
  const y = (value: number) => top + (height - top - bottom) * (1 - value / max);
  const peak = points.reduce((best, point, i) => (point.value > (points[best]?.value ?? -1) ? i : best), 0);
  const path = points.map((point, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
  const ticks = [...new Set([0, Math.round(max / 2), max])];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={points.map((p) => `${p.label}: ${p.value} ${unit}`).join(', ')}>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={left} x2={width - 4} y1={y(tick)} y2={y(tick)} stroke="var(--color-line)" strokeDasharray="3 4" />
          <text x={left - 6} y={y(tick) + 3} textAnchor="end" fontSize="8" fill="var(--color-muted)">{tick}</text>
        </g>
      ))}
      <path d={path} fill="none" stroke="var(--color-brand)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((point, i) => (
        <g key={point.label}>
          <circle cx={x(i)} cy={y(point.value)} r="3.5" fill="var(--color-brand)" stroke="var(--color-surface)" strokeWidth="1.5" />
          <text x={x(i)} y={height - 6} textAnchor="middle" fontSize="8" fill="var(--color-muted)">{point.label}</text>
        </g>
      ))}
      {points[peak] && points[peak].value > 0 ? (
        <g>
          <rect x={x(peak) - 26} y={y(points[peak].value) - 22} width="52" height="15" rx="7.5" fill="var(--color-sand)" />
          <text x={x(peak)} y={y(points[peak].value) - 11.5} textAnchor="middle" fontSize="8" fill="var(--color-ink)">
            {points[peak].value} {unit}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

/** Orange bars; `format` turns a value into its label for the accessible name. */
export function BarChart({ points, describe }: { points: readonly Point[]; describe: (value: number) => string }) {
  const max = Math.max(1, ...points.map((point) => point.value));
  return (
    <div className="flex h-36 items-end gap-2.5" role="img" aria-label={points.map((p) => `${p.label}: ${describe(p.value)}`).join(', ')}>
      {points.map((point) => (
        <div key={point.label} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex h-28 w-full items-end">
            <div
              className={`w-full rounded-t-[6px] ${point.value > 0 ? 'bg-[linear-gradient(180deg,#ff8a3d,#ff6a0f)]' : 'bg-track'}`}
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
    <Link href={href} className="press flex flex-col items-center gap-2 rounded-[16px] border border-line bg-surface px-2 py-4 text-center text-[12px] text-label">
      <IconSquare icon={icon} tone={tone} size={44} />
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
    <Link href={href} className="press flex items-center gap-3 rounded-[18px] border border-line bg-surface p-3.5">{body}</Link>
  ) : (
    <div className="flex items-center gap-3 rounded-[18px] border border-line bg-surface p-3.5">{body}</div>
  );
}

/** Initials on a warm gradient tile, standing in for a profile photo. */
export function PhotoTile({ initials, size = 64 }: { initials: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[14px] bg-[linear-gradient(135deg,#ff8a3d,#3a2316_70%)] font-bold text-white"
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
