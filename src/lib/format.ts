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

/** Basis points as a percentage label: 1500 → "15%", 550 → "5,5%". */
export function formatBps(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const rest = bps % 100;
  return rest === 0 ? `${whole}%` : `${whole},${String(rest).padStart(2, '0').replace(/0$/, '')}%`;
}
