import Link from 'next/link';

import { Icon, type IconName } from './icon';

/**
 * Vento UI kit. One component per pattern in the design system: button, card,
 * badge, note, stat, avatar, progress. Everything else in the app is composed
 * from these, so the visual rules live in one file.
 */

type ButtonVariant = 'primary' | 'ghost' | 'soft' | 'danger' | 'text';

const BUTTON_BASE =
  'press inline-flex items-center justify-center gap-2 rounded-full border font-[550] text-[13px] tracking-[.1px] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-brand text-white hover:bg-brand-hover hover:shadow-button',
  ghost: 'border-line-ghost bg-surface text-brand hover:bg-brand-wash',
  soft: 'border-transparent bg-brand-soft text-brand hover:bg-brand-tint',
  danger: 'border-danger-line bg-danger-soft text-danger',
  text: 'border-transparent bg-transparent text-brand !px-0 !min-h-0',
};

export function buttonClass(variant: ButtonVariant = 'primary', size: 'md' | 'sm' = 'md', extra = '') {
  // 48px is a comfortable thumb target on phones; desktop keeps the sketch's 45px.
  const sizing = size === 'sm' ? 'min-h-10 px-4 text-[12px] md:min-h-9 md:px-3.5' : 'min-h-12 px-5 md:min-h-[45px]';
  return `${BUTTON_BASE} ${sizing} ${BUTTON_VARIANTS[variant]} ${extra}`;
}

interface ButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  icon?: IconName;
  trailingIcon?: IconName;
  className?: string;
}

export function ButtonLink({
  href,
  children,
  variant = 'primary',
  size = 'md',
  icon,
  trailingIcon,
  className = '',
}: ButtonProps & { href: string }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {icon ? <Icon name={icon} className="!h-[18px] !w-[18px]" /> : null}
      {children}
      {trailingIcon ? <Icon name={trailingIcon} className="!h-[18px] !w-[18px]" /> : null}
    </Link>
  );
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  trailingIcon,
  className = '',
  ...rest
}: ButtonProps & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>) {
  return (
    <button type="button" className={buttonClass(variant, size, className)} {...rest}>
      {icon ? <Icon name={icon} className="!h-[18px] !w-[18px]" /> : null}
      {children}
      {trailingIcon ? <Icon name={trailingIcon} className="!h-[18px] !w-[18px]" /> : null}
    </button>
  );
}

export function Card({
  children,
  tone = 'plain',
  className = '',
  as: Tag = 'section',
}: {
  children: React.ReactNode;
  tone?: 'plain' | 'tinted' | 'brand' | 'warm';
  className?: string;
  as?: 'section' | 'article' | 'div' | 'li' | 'aside';
}) {
  const tones = {
    plain: 'border-line bg-surface',
    tinted: 'border-line bg-brand-tint',
    brand: 'border-brand bg-brand text-white rounded-hero',
    warm: 'border-[#f4e8d2] bg-warning-soft',
  } as const;
  return (
    <Tag className={`rounded-card border p-5 shadow-card sm:p-6 ${tones[tone]} ${className}`}>
      {children}
    </Tag>
  );
}

export type BadgeTone = 'success' | 'brand' | 'warning' | 'quiet' | 'danger';

export function Badge({ children, tone = 'success' }: { children: React.ReactNode; tone?: BadgeTone }) {
  const tones: Record<BadgeTone, string> = {
    success: 'bg-success-soft text-success',
    brand: 'bg-brand-soft text-brand',
    warning: 'bg-warning-soft text-warning',
    quiet: 'bg-quiet-soft text-quiet',
    danger: 'bg-danger-soft text-danger',
  };
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Note({
  children,
  title,
  tone = 'brand',
  icon = 'info',
  className = '',
}: {
  children: React.ReactNode;
  title?: string;
  tone?: 'brand' | 'warning';
  icon?: IconName;
  className?: string;
}) {
  const tones = {
    brand: 'border-[#e9edf6] bg-brand-wash text-[#627295]',
    warning: 'border-[#f4e8d2] bg-[#fff8ed] text-warning',
  } as const;
  return (
    <div className={`flex items-start gap-2.5 rounded-note border px-4 py-3.5 text-[12px] leading-relaxed ${tones[tone]} ${className}`}>
      <Icon name={icon} className="mt-0.5 !h-4 !w-4 opacity-80" />
      <div>
        {title ? <strong className="block font-[550] text-ink">{title}</strong> : null}
        {children}
      </div>
    </div>
  );
}

export function Eyebrow({ children, icon }: { children: React.ReactNode; icon?: IconName }) {
  return (
    <p className="flex items-center gap-1.5 text-[10px] font-[550] uppercase tracking-[1px] text-brand">
      {icon ? <Icon name={icon} className="!h-4 !w-4" /> : null}
      {children}
    </p>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lead,
  action,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className="mt-2 text-[28px] leading-tight tracking-[-0.9px] sm:text-[32px]">{title}</h1>
        {lead ? <p className="mt-2 text-[13px] leading-[1.8] text-muted">{lead}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  highlight = false,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: IconName;
  highlight?: boolean;
}) {
  return (
    <article
      className={`relative rounded-card border p-4 shadow-card ${highlight ? 'border-brand bg-brand text-white' : 'border-line bg-surface'}`}
    >
      {icon ? (
        <span
          className={`absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full ${highlight ? 'bg-white/15 text-white' : 'bg-brand-tint text-[#768bd0]'}`}
        >
          <Icon name={icon} className="!h-4 !w-4" />
        </span>
      ) : null}
      <p className={`pr-8 text-[12px] ${highlight ? 'text-on-brand-muted' : 'text-muted'}`}>{label}</p>
      <p className={`tabular mt-2.5 text-[24px] font-semibold tracking-[-0.7px] sm:text-[28px] ${highlight ? 'text-white' : 'text-brand'}`}>
        {value}
      </p>
      {hint ? <p className={`mt-1 text-[11px] ${highlight ? 'text-on-brand-muted' : 'text-quiet'}`}>{hint}</p> : null}
    </article>
  );
}

const AVATAR_TONES = {
  a1: 'bg-[#eef1fa] text-[#687da8]',
  a2: 'bg-[#f0edf9] text-[#8e7dad]',
  a3: 'bg-[#eaf4f2] text-[#739b91]',
  a4: 'bg-[#f8efeb] text-[#b59889]',
} as const;

export function Avatar({
  initials,
  tone = 'a1',
  size = 40,
}: {
  initials: string;
  tone?: keyof typeof AVATAR_TONES;
  size?: number;
}) {
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full font-[550] ${AVATAR_TONES[tone]}`}
      style={{ width: size, height: size, fontSize: Math.round(size / 3.1) }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

/** Done and reserved shares as percentages, both supplied by the caller. */
export function ProgressBar({ donePercent, reservedPercent = 0 }: { donePercent: number; reservedPercent?: number }) {
  return (
    <div
      className="flex h-[7px] overflow-hidden rounded-full bg-[#edf0f7]"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={donePercent}
    >
      <span className="bg-brand-bar" style={{ width: `${donePercent}%` }} />
      <span className="bg-brand-reserved" style={{ width: `${reservedPercent}%` }} />
    </div>
  );
}

export function DateTile({ day, month }: { day: string; month: string }) {
  return (
    <div className="grid h-[60px] w-[54px] shrink-0 place-items-center content-center rounded-[13px] border border-line bg-brand-tint text-brand">
      <span className="text-[24px] font-semibold leading-none">{day}</span>
      <span className="mt-1 text-[9px] tracking-[1px] text-muted">{month}</span>
    </div>
  );
}

export function Field({
  label,
  icon,
  children,
  hint,
}: {
  label: string;
  icon?: IconName;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-label">
        {icon ? <Icon name={icon} className="!h-3.5 !w-3.5 text-brand" /> : null}
        {label}
      </span>
      {children}
      {hint ? <span className="text-[11px] leading-relaxed text-muted">{hint}</span> : null}
    </label>
  );
}

// 16px text on phones: below that, iOS Safari zooms the page on focus.
export const inputClass =
  'h-12 w-full rounded-input border border-line-input bg-surface px-3.5 text-base font-medium text-ink-strong focus:border-brand-focus focus:shadow-focus focus:outline-none md:h-11 md:text-[13px]';

export const textareaClass =
  'min-h-24 w-full rounded-input border border-line-input bg-surface px-3.5 py-3 text-base text-ink-strong focus:border-brand-focus focus:shadow-focus focus:outline-none md:text-[13px]';

export function EmptyState({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line-ghost bg-surface px-5 py-8 text-center text-[13px] text-muted">
      <p>{children}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function KeyValue({ label, value, icon }: { label: string; value: string; icon?: IconName }) {
  return (
    <div className="flex items-start gap-2.5">
      {icon ? <Icon name={icon} className="mt-0.5 !h-[18px] !w-[18px] text-subtle" /> : null}
      <div>
        <dt className="text-[11px] text-muted">{label}</dt>
        <dd className="mt-0.5 text-[13px] font-[550] text-ink">{value}</dd>
      </div>
    </div>
  );
}
