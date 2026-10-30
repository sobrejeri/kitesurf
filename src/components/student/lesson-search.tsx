'use client';

import Link from 'next/link';
import { useState } from 'react';

import { LANGUAGES, MAX_HOURS, MIN_HOURS } from '@/data/demo';
import { LEVEL_LABELS, type Beach, type QuoteRow } from '@/lib/data-labels';
import { formatMoney } from '@/lib/format';

import { Icon, type IconName } from '../icon';
import { buttonClass } from '../ui';

/** One tappable row of the search card: icon, small label, value, chevron. */
function SearchRow({ label, icon, children, chevron = true }: { label: string; icon: IconName; children: React.ReactNode; chevron?: boolean }) {
  return (
    <label className="relative flex items-center gap-4 border-b border-line px-1 py-3.5 last:border-b-0 lg:border-b-0 lg:border-r lg:px-4">
      <Icon name={icon} className="!h-6 !w-6 shrink-0 text-brand" />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium uppercase tracking-[1.6px] text-muted">{label}</span>
        {children}
      </span>
      {chevron ? <Icon name="chevron" className="!h-5 !w-5 shrink-0 text-muted lg:hidden" /> : null}
    </label>
  );
}

const controlClass =
  'mt-0.5 w-full appearance-none bg-transparent text-[17px] font-semibold text-ink focus:outline-none [color-scheme:dark] lg:text-[15px]';

/**
 * The Explorar search. The total under it is looked up in the server's quote
 * table for the chosen hours — the component never multiplies.
 */
export function LessonSearch({
  defaultDate,
  quotes,
  beaches,
}: {
  defaultDate: string;
  quotes: readonly QuoteRow[];
  beaches: readonly Beach[];
}) {
  const [hours, setHours] = useState(2);
  const quote = quotes.find((row) => row.hours === hours);

  return (
    <>
      <form
        action="/aluno/reservar"
        className="glass relative z-10 -mt-4 rounded-[26px] border border-line px-4 pb-4 pt-1 shadow-search lg:mt-6 lg:grid lg:grid-cols-[1fr_1fr_1.1fr_1fr_auto] lg:items-center lg:p-3"
      >
        <SearchRow label="Sua praia" icon="pin">
          <select name="praia" className={controlClass} defaultValue={beaches[0]?.id}>
            {beaches.length === 0 ? <option value="">Nenhuma praia disponível</option> : null}
            {beaches.map((beach) => (
              <option key={beach.id} value={beach.id}>{beach.name}</option>
            ))}
          </select>
        </SearchRow>
        <SearchRow label="Qual dia?" icon="calendar" chevron={false}>
          <input name="dia" type="date" defaultValue={defaultDate} min={defaultDate} className={controlClass} />
        </SearchRow>
        <SearchRow label="Seu momento no kite" icon="kite">
          <select name="nivel" className={controlClass} defaultValue="first_time">
            {Object.entries(LEVEL_LABELS).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </SearchRow>
        <SearchRow label="Meu idioma" icon="globe">
          <select name="idioma" className={controlClass} defaultValue={LANGUAGES[0]}>
            {LANGUAGES.map((language) => (
              <option key={language}>{language}</option>
            ))}
          </select>
        </SearchRow>

        <div className="flex items-center gap-4 px-1 py-3.5 lg:hidden">
          <Icon name="clock" className="!h-6 !w-6 shrink-0 text-brand" />
          <span className="flex-1 text-[11px] font-medium uppercase tracking-[1.6px] text-muted">Quantas horas?</span>
          <Stepper hours={hours} onChange={setHours} />
        </div>
        <input type="hidden" name="horas" value={hours} />

        <div className="hidden items-center gap-3 px-4 lg:flex">
          <Stepper hours={hours} onChange={setHours} />
        </div>

        <button type="submit" className={buttonClass('primary', 'md', 'mt-2 w-full !min-h-14 text-[16px] lg:col-span-5 lg:mt-3')}>
          Encontrar minha aula
          <Icon name="arrow" className="!h-5 !w-5" />
        </button>
      </form>

      <ul className="mt-5 grid grid-cols-3 divide-x divide-line text-[12px] leading-tight text-label">
        {[
          ['shield', 'Instrutores aprovados'],
          ['users', 'Para todos os níveis'],
          ['clock', 'Horas flexíveis'],
        ].map(([icon, text]) => (
          <li key={text} className="flex items-center justify-center gap-2 px-2">
            <Icon name={icon as IconName} className="!h-6 !w-6 shrink-0 text-label" />
            <span>{text}</span>
          </li>
        ))}
      </ul>

      <Link
        href={`/aluno/reservar?horas=${hours}`}
        className="press mt-6 flex items-center gap-4 rounded-[20px] border border-line bg-surface px-4 py-4"
      >
        <Icon name="clock" className="!h-8 !w-8 shrink-0 text-brand" />
        <span className="min-w-0 flex-1">
          <strong className="tabular block text-[16px] font-semibold text-ink">
            {quote ? (
              <>
                {hours}h × {formatMoney(quote.hourly_rate_cents)}/hora = <span className="text-brand">{formatMoney(quote.total_cents)}</span>
              </>
            ) : (
              'Valores indisponíveis no momento'
            )}
          </strong>
          <span className="text-[12px] text-muted">Você escolhe as horas. O total é calculado automaticamente.</span>
        </span>
        <Icon name="chevron" className="!h-5 !w-5 text-muted" />
      </Link>
    </>
  );
}

function Stepper({ hours, onChange }: { hours: number; onChange: (next: number) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-sand p-1">
      <button
        type="button"
        aria-label="Menos uma hora"
        disabled={hours <= MIN_HOURS}
        onClick={() => onChange(hours - 1)}
        className="press grid h-10 w-10 place-items-center rounded-full bg-line text-ink disabled:opacity-40"
      >
        <Icon name="minus" className="!h-5 !w-5" />
      </button>
      <output className="tabular min-w-[78px] text-center text-[22px] font-semibold text-ink" aria-live="polite">
        {hours}
        <span className="ml-1 text-[14px] font-normal text-label">horas</span>
      </output>
      <button
        type="button"
        aria-label="Mais uma hora"
        disabled={hours >= MAX_HOURS}
        onClick={() => onChange(hours + 1)}
        className="press grid h-10 w-10 place-items-center rounded-full bg-brand text-white disabled:opacity-40"
      >
        <Icon name="plus" className="!h-5 !w-5" />
      </button>
    </div>
  );
}

export interface PathItem {
  tag: string;
  title: string;
  body: string;
  image: string;
  position: string;
  level: string;
}

/** Full-photo cards in a snapping rail on phones, a 3-column grid on desktop. */
export function PathRail({ items }: { items: readonly PathItem[] }) {
  const [index, setIndex] = useState(0);
  return (
    <>
      <ul
        className="snap-rail -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0"
        onScroll={(event) => {
          const rail = event.currentTarget;
          const card = rail.firstElementChild as HTMLElement | null;
          if (card) setIndex(Math.round(rail.scrollLeft / (card.offsetWidth + 12)));
        }}
      >
        {items.map((item, i) => (
          <li key={item.title} className="w-[78%] shrink-0 md:w-auto">
            <Link
              href={`/aluno/reservar?nivel=${item.level}`}
              className={`press relative flex h-[420px] flex-col justify-end overflow-hidden rounded-[22px] border ${i === index ? 'border-brand' : 'border-line'} md:border-line`}
            >
              <img src={item.image} alt="" className="sunset-photo absolute inset-0 h-full w-full object-cover" style={{ objectPosition: item.position }} />
              <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_25%,#08101ee6_68%,#08101e_100%)]" aria-hidden="true" />
              <span className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-[#fff3e8] px-3 py-1.5 text-[12px] font-semibold text-[#1b2433]">
                <Icon name="chart" className="!h-3.5 !w-3.5" /> {item.tag}
              </span>
              <span className="relative p-5">
                <strong className="block text-[24px] font-bold leading-[1.1] text-white">{item.title}</strong>
                <span className="mt-2 block text-[14px] leading-snug text-[#cfd6e1]">{item.body}</span>
                <span className="mt-5 flex items-center gap-3 text-[14px] font-semibold text-brand">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-brand text-white">
                    <Icon name="arrow" className="!h-5 !w-5" />
                  </span>
                  Escolher minhas horas
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-center gap-2 md:hidden" aria-hidden="true">
        {items.map((item, i) => (
          <span key={item.title} className={`h-2 rounded-full transition-all ${i === index ? 'w-5 bg-brand' : 'w-2 bg-line-ghost'}`} />
        ))}
      </div>
    </>
  );
}
