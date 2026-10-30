/**
 * Labels and row shapes shared by server pages and client components. Kept
 * apart from data.ts, which is server-only.
 */

export type Beach = 'prea' | 'jeri';
export type LessonLevel = 'first_time' | 'returning' | 'improving';

export const BEACH_LABELS: Readonly<Record<Beach, string>> = { prea: 'Preá', jeri: 'Jericoacoara' };
export const LEVEL_LABELS: Readonly<Record<LessonLevel, string>> = {
  first_time: 'Primeira vez',
  returning: 'Já fiz aulas',
  improving: 'Quero evoluir',
};

export interface QuoteRow {
  hours: number;
  hourly_rate_cents: number;
  total_cents: number;
}
