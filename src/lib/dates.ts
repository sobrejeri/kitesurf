import { LESSON_TIME_ZONE } from './format';

/** Today's date in Ceará as YYYY-MM-DD, shifted by a number of days. */
export function lessonDate(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: LESSON_TIME_ZONE }).format(now);
}
