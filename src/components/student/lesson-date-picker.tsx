'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { lessonDate } from '@/lib/dates';

const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'] as const;

function parts(ym: string): [number, number] {
  const [year = 0, month = 0] = ym.split('-').map(Number);
  return [year, month];
}

function shiftMonth(ym: string, amount: number): string {
  const [year, month] = parts(ym);
  const shifted = new Date(year, month - 1 + amount, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
}

function labelForDate(value: string, options: Intl.DateTimeFormatOptions): string {
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number);
  if (!year || !month || !day) return 'Escolher data';
  return new Intl.DateTimeFormat('pt-BR', options).format(new Date(year, month - 1, day));
}

/**
 * Accessible calendar with non-interactive past days. HTML's native date input
 * still exposes past dates in some versions of iOS Safari even when min is set.
 *
 * Date keys use YYYY-MM-DD in the lesson's timezone (America/Fortaleza),
 * never Date#toISOString(), so UTC shifts cannot enable yesterday.
 */
export function LessonDatePicker({
  value,
  onChange,
  ariaLabel = 'Data da aula',
  className = '',
}: {
  value: string;
  onChange: (date: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const dialogId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [monthKey, setMonthKey] = useState(value.slice(0, 7));

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const selected = dialog.current?.querySelector<HTMLButtonElement>('[data-selected="true"]');
    const target = selected && !selected.disabled
      ? selected
      : dialog.current?.querySelector<HTMLButtonElement>('[data-day="true"]:not(:disabled)');
    target?.focus();
  }, [open, monthKey]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function choose(date: string) {
    if (date < lessonDate()) return; // Guard against the day changing while open.
    onChange(date);
    close();
  }

  function openCalendar() {
    const today = lessonDate();
    setMonthKey((value >= today ? value : today).slice(0, 7));
    setOpen(true);
  }

  const today = lessonDate();
  const [year, month] = parts(monthKey);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const slots = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const previousDisabled = monthKey <= today.slice(0, 7);
  const monthTitle = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, 1));

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`${className} text-left`}
        aria-label={`${ariaLabel}: ${labelForDate(value, { day: 'numeric', month: 'long', year: 'numeric' })}. Abrir calendário`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onClick={openCalendar}
      >
        {labelForDate(value, { day: 'numeric', month: 'short', year: 'numeric' })}
      </button>
      {mounted && open
        ? createPortal(
            <div
              className="fixed inset-0 z-[300] flex items-center justify-center bg-[#00101de8] p-4"
              onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
            >
              <div
                ref={dialog}
                id={dialogId}
                role="dialog"
                aria-modal="true"
                aria-label="Escolher a data da aula"
                onKeyDown={(event) => { if (event.key === 'Escape') close(); }}
                className="w-full max-w-[370px] rounded-[26px] border border-[#237b98] bg-[#06263e] p-5 text-[#f4fbff] shadow-[0_24px_70px_#000c18] sm:p-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[19px] font-extrabold capitalize tracking-tight">
                    {monthTitle}
                  </h2>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={previousDisabled}
                      aria-label="Mês anterior"
                      className="grid h-10 w-10 place-items-center rounded-full bg-[#0b4362] text-[26px] text-[#00e0ec] disabled:cursor-not-allowed disabled:opacity-25"
                      onClick={() => setMonthKey(shiftMonth(monthKey, -1))}
                    >‹</button>
                    <button
                      type="button"
                      aria-label="Próximo mês"
                      className="grid h-10 w-10 place-items-center rounded-full bg-[#0b4362] text-[26px] text-[#00e0ec]"
                      onClick={() => setMonthKey(shiftMonth(monthKey, 1))}
                    >›</button>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-7 gap-1" aria-label={monthTitle}>
                  {WEEKDAYS.map((day) => (
                    <span key={day} className="py-2 text-center text-[10px] font-bold tracking-wider text-[#98b7c7]">
                      {day}
                    </span>
                  ))}
                  {Array.from({ length: slots }, (_, slot) => {
                    const day = slot - firstWeekday + 1;
                    if (day < 1 || day > daysInMonth) {
                      return <span key={slot} aria-hidden="true" />;
                    }
                    const key = `${monthKey}-${String(day).padStart(2, '0')}`;
                    const past = key < today;
                    const selected = key === value;
                    return (
                      <button
                        key={key}
                        type="button"
                        data-day="true"
                        data-selected={selected}
                        aria-label={labelForDate(key, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        aria-pressed={selected}
                        aria-current={key === today ? 'date' : undefined}
                        disabled={past}
                        onClick={() => choose(key)}
                        className={`grid aspect-square min-h-10 place-items-center rounded-full text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00deec] ${
                          past
                            ? 'cursor-not-allowed text-[#637d8d] opacity-45'
                            : selected
                              ? 'bg-[#00dbe8] text-[#001f35]'
                              : key === today
                                ? 'border border-[#00dbe8] text-[#00e6ec]'
                                : 'text-white hover:bg-[#145371]'
                        }`}
                      >{day}</button>
                    );
                  })}
                </div>
                <p className="mt-4 text-[12px] text-[#b5d1de]">
                  Datas anteriores a hoje ficam indisponíveis.
                </p>
                <div className="mt-4 flex justify-between gap-3 border-t border-[#21516c] pt-4">
                  <button type="button" onClick={close} className="rounded-full px-4 py-2 text-[#b5d1de]">Cancelar</button>
                  <button type="button" onClick={() => choose(lessonDate())} className="rounded-full bg-[#00dbe8] px-5 py-2 font-bold text-[#00243b]">
                    Hoje
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
