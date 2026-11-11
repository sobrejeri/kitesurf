/**
 * Display helpers. They format values that arrive already computed; none of
 * them derives an amount.
 */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Always display monetary values with two decimal places (e.g., R$ 600,00). */
export function formatMoney(amountCents: number): string {
  return BRL.format(amountCents / 100);
}

/** 90 → "1h 30min", 120 → "2h", 30 → "30min". Durations are never "1,5h". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}min`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}min`;
}

/** Lessons happen in Ceará, which is UTC−3 all year (no daylight saving). */
export const LESSON_TIME_ZONE = 'America/Fortaleza';
export const LESSON_UTC_OFFSET = '-03:00';

const DATE_LONG = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', timeZone: LESSON_TIME_ZONE });
const DATE_SHORT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: LESSON_TIME_ZONE });
const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: LESSON_TIME_ZONE });
const DAY = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', timeZone: LESSON_TIME_ZONE });
const MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: LESSON_TIME_ZONE });

export const formatDateLong = (iso: string) => DATE_LONG.format(new Date(iso));
export const formatDateShort = (iso: string) => DATE_SHORT.format(new Date(iso));
export const formatTime = (iso: string) => TIME.format(new Date(iso));
export const formatDay = (iso: string) => DAY.format(new Date(iso));
export const formatMonthTag = (iso: string) => MONTH.format(new Date(iso)).toUpperCase();

const WEEKDAY_DATE = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: LESSON_TIME_ZONE });
const HOUR = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: LESSON_TIME_ZONE });

const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: LESSON_TIME_ZONE });
const SHORT_DAY = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: LESSON_TIME_ZONE });
const SHORT_DAY_YEAR = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: LESSON_TIME_ZONE });

/**
 * A message or notice time the way phone apps show it, in Ceará time:
 * "Agora", "Há 12 min", "Hoje, 08:00", "Ontem, 18:10", "4 de nov." and, for
 * another year, "4 de nov. de 2025".
 */
export function formatRelativeStamp(iso: string, now = Date.now()): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes >= 0 && minutes < 1) return 'Agora';
  if (minutes >= 1 && minutes < 60) return `Há ${minutes} min`;
  const day = DAY_KEY.format(at);
  if (day === DAY_KEY.format(now)) return `Hoje, ${TIME.format(at)}`;
  if (day === DAY_KEY.format(now - 86_400_000)) return `Ontem, ${TIME.format(at)}`;
  return day.slice(0, 4) === DAY_KEY.format(now).slice(0, 4) ? SHORT_DAY.format(at) : SHORT_DAY_YEAR.format(at);
}

const WEEKDAY_SHORT = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: LESSON_TIME_ZONE });

/** When a lesson starts, said the short way: "hoje às 09:00", "amanhã às 15:30", "qua., 12 de nov. às 09:00". */
export function formatLessonWhen(iso: string, now = Date.now()): string {
  const at = Date.parse(iso);
  const day = DAY_KEY.format(at);
  const label = day === DAY_KEY.format(now) ? 'hoje'
    : day === DAY_KEY.format(now + 86_400_000) ? 'amanhã'
      : WEEKDAY_SHORT.format(at);
  return `${label} às ${TIME.format(at)}`;
}

/** "terça-feira, 10 de novembro", in Ceará time. */
export const formatWeekdayDate = (iso: string) => WEEKDAY_DATE.format(new Date(iso));

/** The greeting for the time of day in Ceará: before noon, afternoon, evening. */
export function dayGreeting(iso: string): 'Bom dia' | 'Boa tarde' | 'Boa noite' {
  const hour = Number(HOUR.format(new Date(iso)));
  return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
}

/** Basis points as a percentage label: 1500 → "15%", 550 → "5,5%". */
export function formatBps(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const rest = bps % 100;
  return rest === 0 ? `${whole}%` : `${whole},${String(rest).padStart(2, '0').replace(/0$/, '')}%`;
}
