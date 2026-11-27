/**
 * Regras puras da agenda do instrutor (#91): leitura dos turnos do formulário, grade de dia/semana/mês e
 * conversão de folgas/férias em instantes de Fortaleza. Sem dependências: roda no servidor, no cliente e no teste.
 * Fortaleza é UTC−03:00 o ano todo (sem horário de verão), por isso o deslocamento é fixo.
 */
export type AgendaView = 'day' | 'week' | 'month';
export const FORTALEZA_OFFSET = '-03:00';
const OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

export const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;
export const MAX_BREAKS_PER_DAY = 3;

export interface TimeBreak { from: string; to: string }
export interface DayShift { weekday: number; opens: string; closes: string; breaks: TimeBreak[] }
export type ScheduleParse = { ok: true; days: DayShift[]; buffer: number } | { ok: false; error: string };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** "08:00:00" (coluna time do Postgres) -> "08:00". */
export const hhmm = (value: string) => value.slice(0, 5);

/** Lê o formulário de turnos: d{0-6} (marcado), d{n}_opens, d{n}_closes, d{n}_b{0-2}_from/to e buffer. */
export function parseScheduleForm(get: (name: string) => string | null | undefined): ScheduleParse {
  const bufferText = (get('buffer') ?? '').trim();
  const buffer = Number(bufferText);
  if (!/^\d{1,3}$/.test(bufferText) || buffer > 120) return { ok: false, error: 'O intervalo entre aulas vai de 0 a 120 minutos.' };
  const days: DayShift[] = [];
  for (let weekday = 0; weekday < 7; weekday += 1) {
    if (!get(`d${weekday}`)) continue;
    const name = WEEKDAY_NAMES[weekday];
    const opens = (get(`d${weekday}_opens`) ?? '').trim();
    const closes = (get(`d${weekday}_closes`) ?? '').trim();
    if (!HHMM.test(opens) || !HHMM.test(closes) || opens >= closes) {
      return { ok: false, error: `${name}: o início do turno precisa ser antes do fim.` };
    }
    const breaks: TimeBreak[] = [];
    for (let index = 0; index < MAX_BREAKS_PER_DAY; index += 1) {
      const from = (get(`d${weekday}_b${index}_from`) ?? '').trim();
      const to = (get(`d${weekday}_b${index}_to`) ?? '').trim();
      if (!from && !to) continue;
      if (!HHMM.test(from) || !HHMM.test(to) || from >= to) return { ok: false, error: `${name}: confira o início e o fim da pausa.` };
      if (from < opens || to > closes) return { ok: false, error: `${name}: a pausa precisa ficar dentro do turno.` };
      breaks.push({ from, to });
    }
    breaks.sort((a, b) => a.from.localeCompare(b.from));
    for (let index = 1; index < breaks.length; index += 1) {
      const before = breaks[index - 1];
      const current = breaks[index];
      if (before && current && current.from < before.to) return { ok: false, error: `${name}: as pausas não podem se sobrepor.` };
    }
    days.push({ weekday, opens, closes, breaks });
  }
  return { ok: true, days, buffer };
}

/** Formato aceito por public.save_my_weekly_schedule. Nenhum valor financeiro trafega aqui. */
export function toRpcDays(days: DayShift[]) {
  return days.map((day) => ({
    weekday: day.weekday, opens: day.opens, closes: day.closes,
    ...(day.breaks.length ? { breaks: day.breaks } : {}),
  }));
}

export function shiftSummary(day: Pick<DayShift, 'opens' | 'closes' | 'breaks'>): string {
  const pauses = day.breaks.map((item) => `${item.from}–${item.to}`).join(', ');
  return `${day.opens}–${day.closes}${pauses ? ` (pausa ${pauses})` : ''}`;
}

// ---- calendário --------------------------------------------------------------------------------------------------------
const stampOf = (key: string) => Date.parse(`${key}T00:00:00Z`);
const keyOf = (stamp: number) => new Date(stamp).toISOString().slice(0, 10);

export function isDayKey(value: string | null | undefined): value is string {
  return Boolean(value && DAY_KEY.test(value) && keyOf(stampOf(value)) === value);
}
export const addDays = (key: string, days: number) => keyOf(stampOf(key) + days * DAY_MS);
export const weekdayOf = (key: string) => new Date(stampOf(key)).getUTCDay();
const addMonths = (key: string, months: number) => {
  const date = new Date(stampOf(key));
  return keyOf(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
};
/** Dia local (Fortaleza) de um instante ISO. */
export const localDayKey = (iso: string | number | Date) => keyOf(new Date(iso).getTime() - OFFSET_MS);
/** Instante UTC (ISO) da meia-noite local de um dia. */
export const localMidnightIso = (key: string) => `${key}T00:00:00${FORTALEZA_OFFSET}`;

export function viewRange(date: string, view: AgendaView) {
  if (!isDayKey(date)) throw new Error('Data inválida.');
  const base = new Date(stampOf(date));
  let first = date;
  let last = addDays(date, 1);
  let previous = addDays(date, -1);
  let next = addDays(date, 1);
  if (view === 'week') {
    first = addDays(date, -base.getUTCDay());
    last = addDays(first, 7);
    previous = addDays(date, -7);
    next = addDays(date, 7);
  } else if (view === 'month') {
    first = keyOf(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
    last = addMonths(date, 1);
    previous = addMonths(date, -1);
    next = addMonths(date, 1);
  }
  return { first, last, startsAt: localMidnightIso(first), endsAt: localMidnightIso(last), previous, next };
}

/** Grade do mês, domingo a sábado, completando as semanas com dias dos meses vizinhos. */
export function monthGrid(date: string): { key: string; inMonth: boolean }[][] {
  const { first, last } = viewRange(date, 'month');
  const gridStart = addDays(first, -weekdayOf(first));
  const lastDay = addDays(last, -1);
  const gridEnd = addDays(lastDay, 6 - weekdayOf(lastDay));
  const weeks: { key: string; inMonth: boolean }[][] = [];
  for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, index) => {
      const key = addDays(cursor, index);
      return { key, inMonth: key >= first && key < last };
    }));
  }
  return weeks;
}

export function groupByLocalDay<T>(items: T[], iso: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = localDayKey(iso(item));
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

export type TimeOffKind = 'block' | 'day_off' | 'vacation';
export const TIME_OFF_LABELS: Record<TimeOffKind, string> = { block: 'Bloqueio', day_off: 'Folga', vacation: 'Férias' };

/** Folga e férias são dias inteiros: do começo do primeiro dia ao começo do dia seguinte ao último (meia-noite local). */
export function wholeDaysToRange(firstDay: string, lastDay: string): { start: string; end: string } | null {
  if (!isDayKey(firstDay) || !isDayKey(lastDay) || lastDay < firstDay) return null;
  return { start: localMidnightIso(firstDay), end: localMidnightIso(addDays(lastDay, 1)) };
}

/** Quais dias do intervalo [first, last) um bloqueio cobre (para marcar na grade). */
export function daysCovered(startsAt: string, endsAt: string, first: string, last: string): string[] {
  const out: string[] = [];
  const startKey = localDayKey(startsAt);
  const endKey = localDayKey(new Date(new Date(endsAt).getTime() - 1));
  for (let cursor = first > startKey ? first : startKey; cursor < last && cursor <= endKey; cursor = addDays(cursor, 1)) out.push(cursor);
  return out;
}
