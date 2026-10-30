import { LESSON_TIME_ZONE } from './format';

/** Today's date in Ceará as YYYY-MM-DD, shifted by a number of days. */
export function lessonDate(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: LESSON_TIME_ZONE }).format(now);
}

const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: LESSON_TIME_ZONE });
const DAY_LABEL = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: LESSON_TIME_ZONE });

/** YYYY-MM-DD of an instant, in Ceará time. */
export function dayKey(iso: string | Date): string {
  return DAY_KEY.format(typeof iso === 'string' ? new Date(iso) : iso);
}

/** The last `count` days ending today, oldest first, with "dd/mm" labels. */
export function lastDays(count: number): { key: string; label: string }[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.now() - (count - 1 - index) * 86_400_000);
    return { key: DAY_KEY.format(date), label: DAY_LABEL.format(date) };
  });
}
