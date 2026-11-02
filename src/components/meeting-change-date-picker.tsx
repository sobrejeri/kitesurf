'use client';

import { useId, useState } from 'react';

import { Icon } from '@/components/icon';
import { inputClass } from '@/components/ui';

type Role = 'student' | 'instructor';

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC', month: 'long', year: 'numeric',
});
const DATE = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric',
});

function utcDate(day: string): Date {
  return new Date(day + 'T12:00:00Z');
}

function monthIndex(day: string): number {
  return Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1;
}

function dateKey(year: number, month: number, day: number): string {
  return [String(year), String(month + 1).padStart(2, '0'),
    String(day).padStart(2, '0')].join('-');
}

function keepAllowedTime(value: string, day: string, min: string, max: string): string {
  if (!value) return '';
  const lower = day === min.slice(0, 10) ? min.slice(11, 16) : '00:00';
  const upper = day === max.slice(0, 10) ? max.slice(11, 16) : '23:59';
  return value < lower ? lower : value > upper ? upper : value;
}

/**
 * A real disabled-date grid, unlike the native iOS datetime-local control
 * which can show and select out-of-range dates before form validation.
 * All date math uses calendar strings in Ceará local time, not browser TZ.
 * The backend RPC remains responsible for validating every request.
 */
export function MeetingChangeDatePicker({
  initial, min, max, role,
}: {
  initial: string;
  min: string;
  max: string;
  role: Role;
}) {
  const dateLabelId = useId();
  const firstDay = min.slice(0, 10);
  const lastDay = max.slice(0, 10);
  const initialDay = initial.slice(0, 10);
  const safeDay = initialDay < firstDay ? firstDay :
    initialDay > lastDay ? lastDay : initialDay;

  const [day, setDay] = useState(safeDay);
  const [time, setTime] = useState(
    keepAllowedTime(initial.slice(11, 16), safeDay, min, max),
  );
  const [visibleMonth, setVisibleMonth] = useState(monthIndex(safeDay));
  const [expanded, setExpanded] = useState(false);

  const firstMonth = monthIndex(firstDay);
  const lastMonth = monthIndex(lastDay);
  const year = Math.floor(visibleMonth / 12);
  const month = visibleMonth % 12;
  const offset = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((offset + daysInMonth) / 7) * 7 },
    (_, index) => index - offset + 1);

  const minTime = day === firstDay ? min.slice(11, 16) : '00:00';
  const maxTime = day === lastDay ? max.slice(11, 16) : '23:59';
  const selected = day + 'T' + time;
  const student = role === 'student';

  return (
    <div className="grid min-w-0 gap-3">
      <div>
        <label className="mb-1.5 block text-[12px] font-medium text-label" id={dateLabelId}>
          Nova data
        </label>
        <button
          type="button"
          aria-labelledby={dateLabelId}
          aria-expanded={expanded}
          onClick={() => setExpanded(open => !open)}
          className="flex min-h-12 w-full min-w-0 items-center justify-between gap-2 rounded-input border border-line-input bg-surface px-3.5 text-left text-[15px] font-medium text-ink-strong"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icon name="calendar" className="!h-[18px] !w-[18px] shrink-0 text-brand"/>
            <span>{DATE.format(utcDate(day))}</span>
          </span>
          <Icon name="chevronDown" className={'!h-4 !w-4 shrink-0 text-muted transition-transform' +
            (expanded ? ' rotate-180' : '')}/>
        </button>
      </div>

      {expanded ? (
        <div className="min-w-0 rounded-[16px] border border-line bg-brand-tint p-2.5 sm:p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button type="button" aria-label="Mês anterior"
              disabled={visibleMonth <= firstMonth}
              onClick={() => setVisibleMonth(n => n - 1)}
              className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink disabled:cursor-not-allowed disabled:opacity-25">
              <Icon name="chevron" className="!h-5 !w-5 rotate-180"/>
            </button>
            <strong className="text-center text-[13px] font-semibold capitalize text-ink">
              {MONTH.format(new Date(Date.UTC(year, month, 1)))}
            </strong>
            <button type="button" aria-label="Próximo mês"
              disabled={visibleMonth >= lastMonth}
              onClick={() => setVisibleMonth(n => n + 1)}
              className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink disabled:cursor-not-allowed disabled:opacity-25">
              <Icon name="chevron" className="!h-5 !w-5"/>
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5" role="group" aria-label="Escolha o dia do reagendamento">
            {DAYS.map(label => (
              <span key={label} className="py-1 text-center text-[10px] font-semibold uppercase text-muted">
                {label}
              </span>
            ))}
            {cells.map((number, index) => {
              if (number <= 0 || number > daysInMonth) {
                return <span key={'empty-' + index} aria-hidden="true"/>;
              }
              const value = dateKey(year, month, number);
              const disabled = value < firstDay || value > lastDay;
              const chosen = value === day;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  aria-label={DATE.format(utcDate(value))}
                  aria-pressed={chosen}
                  onClick={() => {
                    setTime(previous => keepAllowedTime(previous, value, min, max));
                    setDay(value);
                    setExpanded(false);
                  }}
                  className={'mx-auto grid h-10 w-full min-w-0 place-items-center rounded-xl text-[13px] transition-colors ' +
                    (disabled ? 'cursor-not-allowed text-muted opacity-30' :
                     chosen ? (student ? 'bg-[#5edce8] text-[#052d42]' : 'bg-brand text-on-brand') + ' font-bold' :
                     'text-ink hover:bg-brand-wash')}
                >
                  {number}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Datas anteriores ao prazo permitido estão bloqueadas.
            A nova data deve ser posterior à aula original.
          </p>
        </div>
      ) : null}

      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[12px] font-medium text-label">Horário (Ceará)</span>
        <input
          type="time"
          required
          step={60}
          min={minTime}
          max={maxTime}
          value={time}
          onChange={event => {
            setTime(keepAllowedTime(event.target.value, day, min, max));
          }}
          className={inputClass + ' meeting-change-datetime block min-w-0 max-w-full [color-scheme:dark]'}
        />
      </label>
      {day === firstDay ? (
        <p className="text-[11px] leading-relaxed text-muted">
          Para {DATE.format(utcDate(firstDay))}, escolha um horário a partir de {minTime}.
        </p>
      ) : null}
      <input type="hidden" name="proposedDate" value={time ? selected : ''}/>
    </div>
  );
}
