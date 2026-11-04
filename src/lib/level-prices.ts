import type { LessonLevel, QuoteRow } from './data-labels';

export function levelQuote(quotes: readonly QuoteRow[], level: LessonLevel, hours: number) {
  return quotes.find((row) => row.level === level && row.hours === hours)
    ?? quotes.find((row) => row.level === undefined && row.hours === hours);
}

/** Parse the entered decimal digits without float multiplication. */
export function moneyInputCents(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== 'string' || !/^\d{1,5}(?:[.,]\d{1,2})?$/.test(raw.trim())) return null;
  const [whole, fraction = ''] = raw.trim().replace(',', '.').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= 1_000_000 ? cents : null;
}
