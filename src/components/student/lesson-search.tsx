'use client';

import Link from 'next/link';
import { useState } from 'react';

import { LANGUAGES, MAX_HOURS, MIN_HOURS } from '@/data/demo';
import { type Beach, type QuoteRow } from '@/lib/data-labels';
import { formatMoney } from '@/lib/format';

import { Icon, type IconName } from '../icon';
import { buttonClass } from '../ui';

/** One row of the search card: orange icon, small label, bold value, chevron. */
function SearchRow({ label, icon, children, chevron = true }: { label: string; icon: IconName; children: React.ReactNode; chevron?: boolean }) {
  return (
    <label className="relative flex items-center gap-4 rounded-[18px] bg-sand px-4 py-3 lg:rounded-none lg:bg-transparent lg:py-2">
      <Icon name={icon} className="!h-6 !w-6 shrink-0 text-[#ff6a13]" />
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] text-muted">{label}</span>
        {children}
      </span>
      {chevron ? <Icon name="chevronDown" className="pointer-events-none !h-5 !w-5 shrink-0 text-ink" /> : null}
    </label>
  );
}

const controlClass =
  'w-full appearance-none bg-transparent text-[16px] font-bold text-ink focus:outline-none lg:text-[15px]';

const LEVELS: readonly { id: string; title: string; hint: string; icon: IconName }[] = [
  { id: 'first_time', title: 'Primeira vez', hint: 'Quero aprender', icon: 'sprout' },
  { id: 'returning', title: 'Intermediário', hint: 'Mais autonomia', icon: 'bars' },
  { id: 'improving', title: 'Avançado', hint: 'Novos desafios', icon: 'crown' },
];

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
  const [level, setLevel] = useState('first_time');
  const quote = quotes.find((row) => row.hours === hours);

  return (
    <>
      <form
        action="/aluno/reservar"
        className="glass relative z-10 -mt-6 grid gap-2.5 rounded-[28px] border border-white/70 p-4 shadow-search lg:mt-6 lg:p-5"
      >
        <div className="flex items-center justify-between gap-3 px-1 pt-1">
          <p className="text-[12px] font-semibold uppercase tracking-[2px] text-ink">Qual é o seu nível no kite?</p>
          <Link href="/aluno/politicas" className="flex items-center gap-1.5 rounded-full bg-sand px-3 py-1.5 text-[12px] text-label">
            <Icon name="help" className="!h-4 !w-4" /> Ajuda?
          </Link>
        </div>
        <fieldset className="grid grid-cols-3 gap-2.5">
          <legend className="sr-only">Seu nível no kite</legend>
          {LEVELS.map((item) => {
            const on = level === item.id;
            return (
              <label
                key={item.id}
                className={`press flex cursor-pointer flex-col items-center gap-1 rounded-[18px] px-2 py-3.5 text-center ${on ? 'btn-primary shadow-button' : 'bg-sand'}`}
              >
                <input type="radio" name="nivel" value={item.id} checked={on} onChange={() => setLevel(item.id)} className="sr-only" />
                <Icon name={item.icon} className={`!h-7 !w-7 ${on ? 'text-white' : 'text-ink'}`} />
                <span className={`text-[14px] font-bold leading-tight ${on ? 'text-white' : 'text-ink'}`}>{item.title}</span>
                <span className={`text-[11px] font-normal leading-tight ${on ? 'text-white/90' : 'text-muted'}`}>{item.hint}</span>
              </label>
            );
          })}
        </fieldset>

        <div className="grid gap-2.5 lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-line lg:rounded-[18px] lg:bg-sand">
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
          <SearchRow label="Seu idioma" icon="globe">
            <select name="idioma" className={controlClass} defaultValue={LANGUAGES[0]}>
              {LANGUAGES.map((language) => (
                <option key={language}>{language}</option>
              ))}
            </select>
          </SearchRow>
        </div>

        <div className="flex items-center gap-3 rounded-[18px] bg-sand py-2.5 pl-4 pr-2">
          <Icon name="clock" className="!h-6 !w-6 shrink-0 text-[#ff6a13]" />
          <span className="flex-1 whitespace-nowrap text-[13px] text-muted">Quantas horas?</span>
          <Stepper hours={hours} onChange={setHours} />
        </div>
        <input type="hidden" name="horas" value={hours} />

        <button type="submit" className={buttonClass('primary', 'md', 'mt-1 w-full !min-h-14 !text-[17px]')}>
          Encontrar minha aula
          <Icon name="arrow" className="!h-5 !w-5" />
        </button>
      </form>

      <ul className="mt-5 grid grid-cols-3 divide-x divide-line-ghost text-[13px] leading-tight text-ink">
        {[
          ['shield', 'Instrutores aprovados'],
          ['users', 'Para todos os níveis'],
          ['clock', 'Horários flexíveis'],
        ].map(([icon, text]) => (
          <li key={text} className="flex flex-col items-center gap-1.5 px-2 text-center">
            <Icon name={icon as IconName} className="!h-7 !w-7 text-ink" />
            <span>{text}</span>
          </li>
        ))}
      </ul>

      <Link
        href={`/aluno/reservar?horas=${hours}&nivel=${level}`}
        className="press mt-6 flex items-center gap-4 rounded-[20px] border border-line bg-surface px-4 py-4 shadow-card"
      >
        <Icon name="clock" className="!h-8 !w-8 shrink-0 text-[#ff6a13]" />
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
    <div className="flex items-center gap-1 rounded-full p-1">
      <button
        type="button"
        aria-label="Menos uma hora"
        disabled={hours <= MIN_HOURS}
        onClick={() => onChange(hours - 1)}
        className="press grid h-10 w-10 place-items-center rounded-full bg-[#e6ecf3] text-ink disabled:opacity-40"
      >
        <Icon name="minus" className="!h-5 !w-5" />
      </button>
      <output className="tabular min-w-[64px] text-center text-[20px] font-semibold text-ink" aria-live="polite">
        {hours}
        <span className="ml-1 text-[13px] font-normal text-label">horas</span>
      </output>
      <button
        type="button"
        aria-label="Mais uma hora"
        disabled={hours >= MAX_HOURS}
        onClick={() => onChange(hours + 1)}
        className="press grid h-10 w-10 place-items-center rounded-full bg-[#ff6a13] text-white shadow-button disabled:opacity-40"
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
