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

const LEVELS: readonly { id: string; title: string }[] = [
  { id: 'first_time', title: 'Primeira vez' },
  { id: 'returning', title: 'Intermediário' },
  { id: 'improving', title: 'Avançado' },
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
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-[13px] font-semibold text-ink">Seu nível no kite</p>
          <Link href="/aluno/politicas" aria-label="Ajuda sobre os níveis" className="grid h-8 w-8 place-items-center rounded-full bg-sand text-label">
            <Icon name="help" className="!h-[18px] !w-[18px]" />
          </Link>
        </div>
        {/* Three plain choices in one segmented control. */}
        <fieldset className="grid grid-cols-3 gap-1 rounded-full bg-sand p-1">
          <legend className="sr-only">Seu nível no kite</legend>
          {LEVELS.map((item) => {
            const on = level === item.id;
            return (
              <label
                key={item.id}
                className={`press flex h-10 cursor-pointer items-center justify-center rounded-full px-1 text-center text-[13px] font-semibold ${on ? 'btn-primary !text-[13px] text-white shadow-button' : 'text-label'}`}
              >
                <input type="radio" name="nivel" value={item.id} checked={on} onChange={() => setLevel(item.id)} className="sr-only" />
                {item.title}
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

        {/* A first idea of the price, looked up in the server's quote table. */}
        <p className="tabular mt-1 text-center text-[12px] text-muted" aria-live="polite">
          {quote ? (
            <>
              {hours}h × {formatMoney(quote.hourly_rate_cents)}/hora ={' '}
              <strong className="font-semibold text-ink">{formatMoney(quote.total_cents)}</strong>
            </>
          ) : (
            'Valores indisponíveis no momento'
          )}
        </p>

        <button type="submit" className={buttonClass('primary', 'md', 'w-full !min-h-14 !text-[17px]')}>
          Encontrar minha aula
          <Icon name="arrow" className="!h-5 !w-5" />
        </button>
      </form>

      <ul className="mt-4 grid grid-cols-3 divide-x divide-line rounded-[22px] border border-line bg-surface py-4 shadow-card">
        {[
          ['shield', 'Instrutores aprovados'],
          ['users', 'Todos os níveis'],
          ['clock', 'Horários flexíveis'],
        ].map(([icon, text]) => (
          <li key={text} className="flex flex-col items-center gap-2 px-2 text-center">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-[#ff6a13]" aria-hidden="true">
              <Icon name={icon as IconName} className="!h-5 !w-5" />
            </span>
            <span className="text-[12px] font-semibold leading-tight text-ink">{text}</span>
          </li>
        ))}
      </ul>

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
