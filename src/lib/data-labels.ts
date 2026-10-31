/**
 * Labels and row shapes shared by server pages and client components. Kept
 * apart from data.ts, which is server-only.
 */

/** A beach the operation offers. Created and managed by the admin. */
export interface Beach {
  id: string;
  name: string;
  region: string;
  active: boolean;
}

export type LessonLevel = 'first_time' | 'returning' | 'improving';

export const LEVEL_LABELS: Readonly<Record<LessonLevel, string>> = {
  first_time: 'Primeira vez',
  returning: 'Intermediário',
  improving: 'Avançado',
};

export interface QuoteRow {
  hours: number;
  hourly_rate_cents: number;
  total_cents: number;
  /** Support vehicle, priced per lesson hour; computed by the server. */
  transport_hourly_cents: number;
  transport_cents: number;
  total_with_transport_cents: number;
}
