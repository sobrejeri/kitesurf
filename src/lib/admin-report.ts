/** Pure aggregation for the admin report screen. Money stays in integer cents; shares are basis points. */
export type ReportBooking = {
  status: 'awaiting_payment' | 'confirmed' | 'completed' | 'cancelled';
  is_test?: boolean;
  created_at: string;
  total_cents: number;
  platform_cents: number;
  partner_cents: number;
  instructor_net_cents: number;
  beach: { name: string } | null;
  instructor: { full_name: string } | null;
};

export type Report = {
  total: number;
  byStatus: Record<ReportBooking['status'], number>;
  paidCount: number;
  volumeCents: number;
  platformCents: number;
  partnerCents: number;
  instructorCents: number;
  averageTicketCents: number;
  cancellationBps: number;
  byBeach: { name: string; count: number; volumeCents: number }[];
  topInstructors: { name: string; count: number }[];
};

export const REPORT_PERIODS = [7, 30, 90] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export function parsePeriod(value: string | undefined): ReportPeriod {
  const n = Number(value);
  return (REPORT_PERIODS as readonly number[]).includes(n) ? (n as ReportPeriod) : 30;
}

export function buildReport(bookings: readonly ReportBooking[], days: number, nowMs = Date.now()): Report {
  const since = nowMs - days * 86_400_000;
  const rows = bookings.filter((b) => !b.is_test && new Date(b.created_at).getTime() >= since);
  const byStatus = { awaiting_payment: 0, confirmed: 0, completed: 0, cancelled: 0 };
  const beaches = new Map<string, { count: number; volumeCents: number }>();
  const instructors = new Map<string, number>();
  let volumeCents = 0, platformCents = 0, partnerCents = 0, instructorCents = 0, paidCount = 0;
  for (const b of rows) {
    byStatus[b.status] += 1;
    const paid = b.status === 'confirmed' || b.status === 'completed';
    if (paid) {
      paidCount += 1;
      volumeCents += b.total_cents; platformCents += b.platform_cents;
      partnerCents += b.partner_cents; instructorCents += b.instructor_net_cents;
      const name = b.beach?.name ?? 'Sem praia';
      const cur = beaches.get(name) ?? { count: 0, volumeCents: 0 };
      beaches.set(name, { count: cur.count + 1, volumeCents: cur.volumeCents + b.total_cents });
      if (b.instructor) instructors.set(b.instructor.full_name, (instructors.get(b.instructor.full_name) ?? 0) + 1);
    }
  }
  return {
    total: rows.length,
    byStatus,
    paidCount,
    volumeCents, platformCents, partnerCents, instructorCents,
    averageTicketCents: paidCount > 0 ? Math.round(volumeCents / paidCount) : 0,
    cancellationBps: rows.length > 0 ? Math.round((byStatus.cancelled * 10000) / rows.length) : 0,
    byBeach: [...beaches].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.volumeCents - a.volumeCents || a.name.localeCompare(b.name)),
    topInstructors: [...instructors].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5),
  };
}
