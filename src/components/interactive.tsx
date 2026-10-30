'use client';

import { useState } from 'react';

import { Icon } from './icon';
import { Note } from './ui';

/**
 * The few pieces of the prototype that hold local state. None of them talks to
 * a server: a submitted form only confirms on screen that the demo registered
 * it, which is what the sketch does.
 */

export function HoursStepper({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="inline-flex h-10 min-w-[136px] items-center justify-between gap-3 rounded-chip bg-brand-tint px-1.5">
      <button
        type="button"
        aria-label="Menos uma hora"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-brand disabled:opacity-40"
      >
        <Icon name="minus" className="!h-4 !w-4" />
      </button>
      <output className="tabular text-[17px] font-semibold text-brand" aria-live="polite">
        {value}
        <span className="ml-1 text-[10px] font-normal text-muted">horas</span>
      </output>
      <button
        type="button"
        aria-label="Mais uma hora"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-brand disabled:opacity-40"
      >
        <Icon name="plus" className="!h-4 !w-4" />
      </button>
    </div>
  );
}

export function Segmented({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly string[];
  value: string;
  onChange: (next: string) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 rounded-search bg-sand p-1.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="tab"
          aria-selected={option === value}
          onClick={() => onChange(option)}
          className={`h-9 flex-1 whitespace-nowrap rounded-input px-3 text-[12px] ${option === value ? 'bg-surface font-[550] text-brand shadow-card' : 'text-quiet'}`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function UnderlineTabs({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly string[];
  value: string;
  onChange: (next: string) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-6 overflow-x-auto border-b border-line">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="tab"
          aria-selected={option === value}
          onClick={() => onChange(option)}
          className={`-mb-px shrink-0 border-b-2 py-2.5 text-[13px] ${option === value ? 'border-brand font-[550] text-brand' : 'border-transparent text-quiet'}`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ label, defaultOn = true }: { label: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setOn(!on)}
      className={`inline-flex items-center gap-2.5 rounded-input border px-3.5 py-2 text-[12px] font-[550] ${on ? 'border-[#cfe5da] bg-success-soft text-success' : 'border-line bg-surface text-muted'}`}
    >
      <span className={`relative h-5 w-9 rounded-full transition ${on ? 'bg-success' : 'bg-[#d5dae4]'}`} aria-hidden="true">
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      {on ? label : 'Pausado para pedidos'}
    </button>
  );
}

/**
 * A form whose submit only acknowledges on screen. Used for every "send for
 * review" / "save" action in the prototype.
 */
export function DemoForm({
  children,
  confirmation,
  className = '',
}: {
  children: React.ReactNode;
  confirmation: string;
  className?: string;
}) {
  const [sent, setSent] = useState(false);
  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        setSent(true);
      }}
    >
      {children}
      {sent ? (
        <Note className="mt-4" icon="check">
          {confirmation}
        </Note>
      ) : null}
    </form>
  );
}

export function ChipChoice({
  options,
  multiple = false,
  defaultSelected = [],
  label,
}: {
  options: readonly string[];
  multiple?: boolean;
  defaultSelected?: readonly string[];
  label: string;
}) {
  const [selected, setSelected] = useState<readonly string[]>(defaultSelected);
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isOn = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={isOn}
            onClick={() =>
              setSelected((current) =>
                multiple
                  ? isOn
                    ? current.filter((item) => item !== option)
                    : [...current, option]
                  : [option],
              )
            }
            className={`rounded-full border px-3.5 py-2 text-[12px] ${isOn ? 'border-brand bg-brand-soft font-[550] text-brand' : 'border-line-input bg-surface text-label'}`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-input border border-line-input bg-canvas px-3.5 py-3 text-[12px] text-ink-strong">
        {value}
      </code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => setCopied(true));
        }}
        className="inline-flex min-h-[45px] items-center gap-2 rounded-full bg-brand px-5 text-[13px] font-[550] text-white hover:bg-brand-hover"
      >
        <Icon name="link" className="!h-[18px] !w-[18px]" />
        {copied ? 'Link copiado' : 'Copiar link'}
      </button>
    </div>
  );
}
