import Link from 'next/link';

import { Badge } from '@/components/ui';
import { formatMinutes, formatTime } from '@/lib/format';
import {
  TIME_OFF_LABELS, WEEKDAY_NAMES, addDays, daysCovered, groupByLocalDay, monthGrid, shiftSummary, viewRange,
  weekdayOf, type AgendaView, type DayShift, type TimeOffKind,
} from '@/lib/instructor-agenda';

export interface AgendaEntry {
  id: string;
  startsAt: string;
  minutes: number;
  title: string;
  subtitle: string;
  href: string;
  state: 'scheduled' | 'in_progress' | 'hold';
}
export interface AgendaTimeOff { id: string; startsAt: string; endsAt: string; reason: string; kind: TimeOffKind }
export interface AgendaExtra { day: string; opens: string; closes: string }

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dayNumber = (key: string) => Number(key.slice(8));
const monthName = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1] ?? '';
const dayTitle = (key: string) => `${WEEKDAY_NAMES[weekdayOf(key)] ?? ''}, ${dayNumber(key)} de ${monthName(key)}`;
const STATE_TONE = { scheduled: 'brand', in_progress: 'success', hold: 'warning' } as const;
const STATE_LABEL = { scheduled: 'Agendada', in_progress: 'Em aula', hold: 'Em pagamento' } as const;

export function agendaHref(day: string, view: AgendaView) {
  return `/instrutor/agenda?visao=${view}&dia=${day}`;
}

function availabilityOf(key: string, shifts: Map<number, DayShift>, extras: Map<string, AgendaExtra>, off: AgendaTimeOff[]) {
  const shift = shifts.get(weekdayOf(key));
  const extra = extras.get(key);
  const covering = off.filter((item) => daysCovered(item.startsAt, item.endsAt, key, addDays(key, 1)).length > 0);
  const wholeDayOff = covering.find((item) => item.kind !== 'block');
  return { shift, extra, covering, wholeDayOff };
}

function DayHeader({ day, shifts, extras, off }: { day: string; shifts: Map<number, DayShift>; extras: Map<string, AgendaExtra>; off: AgendaTimeOff[] }) {
  const { shift, extra, covering } = availabilityOf(day, shifts, extras, off);
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
      {shifts.size === 0 && !extra ? <span>Sem turnos salvos</span> : shift ? <span>Turno {shiftSummary(shift)}</span> : extra ? null : <span>Fora do turno</span>}
      {extra ? <Badge tone="quiet">Extra {extra.opens}–{extra.closes}</Badge> : null}
      {covering.map((item) => <Badge key={item.id} tone="warning">{TIME_OFF_LABELS[item.kind]}{item.reason ? ` · ${item.reason}` : ''}</Badge>)}
    </div>
  );
}

function EntryRow({ entry, compact = false }: { entry: AgendaEntry; compact?: boolean }) {
  return (
    <li>
      <Link href={entry.href} className={`press flex items-center gap-3 rounded-[14px] border border-line bg-surface hover:bg-brand-tint ${compact ? 'min-h-12 p-2' : 'min-h-14 p-3'}`}>
        <span className="tabular w-14 shrink-0 text-[14px] font-bold text-brand">{formatTime(entry.startsAt)}<small className="block text-[11px] font-normal text-muted">{formatMinutes(entry.minutes)}</small></span>
        <span className="min-w-0 flex-1 text-[13px]"><strong className="block truncate text-ink">{entry.title}</strong><span className="block truncate text-muted">{entry.subtitle}</span></span>
        <Badge tone={STATE_TONE[entry.state]}>{STATE_LABEL[entry.state]}</Badge>
      </Link>
    </li>
  );
}

/** Day, week and month views of the instructor's real agenda: classes, shifts, breaks, time off and extra hours. */
export function AgendaCalendar({ view, date, entries, off, shifts, extras, today }: {
  view: AgendaView; date: string; entries: AgendaEntry[]; off: AgendaTimeOff[];
  shifts: Map<number, DayShift>; extras: Map<string, AgendaExtra>; today: string;
}) {
  const byDay = groupByLocalDay(entries, (entry) => entry.startsAt);
  const range = viewRange(date, view);

  if (view === 'day') {
    const items = byDay.get(date) ?? [];
    return (
      <section aria-label={dayTitle(date)}>
        <h2 className="text-[18px] font-bold text-ink">{dayTitle(date)}{date === today ? ' · hoje' : ''}</h2>
        <DayHeader day={date} shifts={shifts} extras={extras} off={off} />
        {items.length === 0 ? <p className="mt-4 text-[13px] text-muted">Nenhuma aula neste dia.</p> : <ul className="mt-3 grid gap-2">{items.map((entry) => <EntryRow key={entry.id} entry={entry} />)}</ul>}
      </section>
    );
  }

  if (view === 'week') {
    const days = Array.from({ length: 7 }, (_, index) => addDays(range.first, index));
    return (
      <section aria-label="Semana" className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {days.map((day) => {
          const items = byDay.get(day) ?? [];
          return (
            <div key={day} className={`grid grid-cols-[minmax(0,1fr)] gap-2 rounded-[16px] border p-3 sm:grid-cols-[11rem_minmax(0,1fr)] ${day === today ? 'border-brand bg-brand-tint' : 'border-line bg-surface'}`}>
              <div className="min-w-0">
                <Link href={agendaHref(day, 'day')} className="block min-h-6 text-[14px] font-bold text-ink hover:text-brand">
                  {WEEKDAY_NAMES[weekdayOf(day)] ?? ''}, {dayNumber(day)}{day === today ? ' · hoje' : ''}
                </Link>
                <DayHeader day={day} shifts={shifts} extras={extras} off={off} />
              </div>
              {items.length === 0 ? <p className="self-center text-[12px] text-muted">Sem aulas</p> : (
                <ul className="grid gap-1.5">
                  {items.map((entry) => <EntryRow key={entry.id} entry={entry} compact />)}
                </ul>
              )}
            </div>
          );
        })}
      </section>
    );
  }

  const weeks = monthGrid(date);
  return (
    <section aria-label={`${monthName(date)} de ${date.slice(0, 4)}`}>
      <h2 className="mb-2 text-[18px] font-bold capitalize text-ink">{monthName(date)} de {date.slice(0, 4)}</h2>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted" aria-hidden="true">
        {WEEKDAY_NAMES.map((name) => <span key={name}>{name.slice(0, 3)}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {weeks.flat().map(({ key, inMonth }) => {
          const count = byDay.get(key)?.length ?? 0;
          const { wholeDayOff, shift, extra } = availabilityOf(key, shifts, extras, off);
          const closed = shifts.size > 0 && !shift && !extra;
          return (
            <Link key={key} href={agendaHref(key, 'day')}
              aria-label={`${dayTitle(key)}: ${count} aula(s)${wholeDayOff ? `, ${TIME_OFF_LABELS[wholeDayOff.kind].toLowerCase()}` : closed ? ', sem turno' : ''}`}
              className={`flex min-h-[3.75rem] flex-col items-center justify-between rounded-lg border p-1 text-[12px] sm:min-h-20 sm:items-start sm:p-2 ${
                key === today ? 'border-brand' : 'border-line'} ${!inMonth ? 'opacity-40' : ''} ${wholeDayOff ? 'bg-warning-soft' : closed ? 'bg-line/40' : 'bg-surface'}`}>
              <span className="font-bold text-ink">{dayNumber(key)}</span>
              {count > 0 ? <span className="rounded-full bg-brand px-1.5 text-[11px] font-bold text-on-brand">{count}</span> : wholeDayOff ? <span className="hidden text-[10px] text-muted sm:block">{TIME_OFF_LABELS[wholeDayOff.kind]}</span> : <span className="h-4" />}
            </Link>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted">Número = aulas no dia. Fundo amarelo = folga, férias ou bloqueio. Fundo cinza = sem turno. Toque no dia para abrir.</p>
    </section>
  );
}

