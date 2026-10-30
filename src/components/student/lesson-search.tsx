'use client';

import Link from 'next/link';
import { useState } from 'react';

import { LANGUAGES, MAX_HOURS, MIN_HOURS } from '@/data/demo';
import { BEACH_LABELS, LEVEL_LABELS, type QuoteRow } from '@/lib/data-labels';
import { formatMoney } from '@/lib/format';

import { Icon, type IconName } from '../icon';
import { HoursStepper } from '../interactive';
import { buttonClass } from '../ui';

function SearchField({ label, icon, children }: { label: string; icon: IconName; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 border-line px-1 py-2 lg:border-r lg:px-4 lg:last-of-type:border-r-0">
      <span className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[1px] text-muted">
        <Icon name={icon} className="!h-3.5 !w-3.5 text-brand" />
        {label}
      </span>
      {children}
    </label>
  );
}

const selectClass =
  'w-full appearance-none bg-transparent py-1 text-[14px] font-[550] text-ink focus:outline-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%23283340%27 stroke-width=%272%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_center] bg-no-repeat pr-6';

/**
 * The home search. The total shown under it is looked up from the server's
 * quote table for the chosen hours — the component never multiplies.
 */
export function LessonSearch({ defaultDate, quotes }: { defaultDate: string; quotes: readonly QuoteRow[] }) {
  const [hours, setHours] = useState(2);
  const quote = quotes.find((row) => row.hours === hours);

  return (
    <>
      <form
        action="/aluno/reservar"
        className="relative z-10 -mt-2 grid gap-1 rounded-search border border-[#ecf0f7] bg-surface p-4 shadow-search sm:grid-cols-2 lg:mt-4 lg:grid-cols-[1fr_1fr_1.1fr_1fr_auto_auto] lg:items-center lg:p-3"
      >
        <SearchField label="Sua praia" icon="pin">
          <select name="praia" className={selectClass} defaultValue="prea">
            {Object.entries(BEACH_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </SearchField>
        <SearchField label="Qual dia?" icon="calendar">
          <input name="dia" type="date" defaultValue={defaultDate} className="w-full bg-transparent py-1 text-[14px] font-[550] focus:outline-none" />
        </SearchField>
        <SearchField label="Seu momento no kite" icon="kite">
          <select name="nivel" className={selectClass} defaultValue="first_time">
            {Object.entries(LEVEL_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </SearchField>
        <SearchField label="Meu idioma" icon="globe">
          <select name="idioma" className={selectClass} defaultValue={LANGUAGES[0]}>
            {LANGUAGES.map((language) => (
              <option key={language}>{language}</option>
            ))}
          </select>
        </SearchField>
        <div className="flex flex-col gap-1 px-1 py-2 lg:px-4">
          <span className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[1px] text-muted">
            <Icon name="clock" className="!h-3.5 !w-3.5 text-brand" />
            Quantas horas
          </span>
          <HoursStepper value={hours} onChange={setHours} min={MIN_HOURS} max={MAX_HOURS} />
          <input type="hidden" name="horas" value={hours} />
        </div>
        <button type="submit" className={buttonClass('primary', 'md', 'mt-2 !rounded-[13px] sm:col-span-2 lg:col-span-1 lg:mt-0 lg:ml-2')}>
          Encontrar minha aula
          <Icon name="arrow" className="!h-[18px] !w-[18px]" />
        </button>
      </form>

      <div className="mt-4 flex items-start gap-3 rounded-search border border-line bg-brand-wash px-4 py-3.5 text-[12px]">
        <Icon name="clock" className="!h-[18px] !w-[18px] text-[#7b8ec7]" />
        <p className="text-muted">
          <strong className="tabular block font-[550] text-brand">
            {quote ? `${hours}h × ${formatMoney(quote.hourly_rate_cents)}/hora = ${formatMoney(quote.total_cents)}` : 'Valores indisponíveis no momento'}
          </strong>
          Você escolhe as horas. O total é calculado automaticamente.
        </p>
      </div>
    </>
  );
}

export function PathCard({
  tag,
  title,
  body,
  image,
}: {
  tag: string;
  title: string;
  body: string;
  image: string;
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="relative h-44 bg-cover bg-center" style={{ backgroundImage: `url(${image})` }}>
        <span className="absolute left-3 top-3 rounded-full bg-white px-2.5 py-1 text-[10px] font-medium text-ink">{tag}</span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-[16px]">{title}</h3>
        <p className="mt-1.5 flex-1 text-[12px] leading-relaxed text-muted">{body}</p>
        <Link href="/aluno/reservar" className="mt-4 flex items-center justify-between border-t border-line pt-4">
          <span>
            <strong className="block text-[13px] font-[550] text-brand">Escolher minhas horas</strong>
            <span className="text-[10px] text-muted">Você define a duração</span>
          </span>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-brand">
            <Icon name="arrow" className="!h-4 !w-4" />
          </span>
        </Link>
      </div>
    </article>
  );
}
