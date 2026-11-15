import Link from 'next/link';

import { DataTable, DemoBanner, PageHead, pageHref } from '@/components/business/kit';
import { CASH_SESSIONS } from '@/lib/business/demo';
import { closingSummary } from '@/lib/business/caixa';
import { dayLabel, parseScope, scopeQuery, unitName, unitsInScope } from '@/lib/business/rules';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Central de relatórios' };
const PERIODS = [{ days: 1, label: 'Ontem e hoje' }, { days: 7, label: '7 dias' }, { days: 30, label: '30 dias' }];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const scope = parseScope(params);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const days = PERIODS.some((p) => String(p.days) === one(params.dias)) ? Number(one(params.dias)) : 30;
  const base: Record<string, string> = Object.fromEntries(new URLSearchParams(scopeQuery(scope).slice(1)));
  const ids = new Set(unitsInScope(scope).map((u) => u.id));
  const rows = CASH_SESSIONS.filter((s) => s.closing && ids.has(s.unitId) && s.dayOffset >= -days).flatMap((s) => { const c = closingSummary(s); return c ? [{ id: s.id, c }] : []; });
  const total = rows.reduce((t, r) => t + r.c.totals.salesTotalCents, 0);
  return (
    <>
      <DemoBanner />
      <PageHead title="Central de relatórios" subtitle={`Fechamentos de caixa do período · vendido ${formatMoney(total)}`} />
      <nav aria-label="Período" className="mb-3 flex flex-wrap gap-2">{PERIODS.map((p) => (
        <Link key={p.days} href={pageHref('/admin/business/relatorios', { ...base, dias: String(p.days) }, 1)} aria-current={days === p.days ? 'true' : undefined}
          className={`press rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${days === p.days ? 'border-brand bg-brand text-on-brand' : 'border-line-ghost text-ink hover:bg-brand-wash'}`}>{p.label}</Link>))}</nav>
      <DataTable rows={rows} page={1} pageSize={10} hrefForPage={(p) => pageHref('/admin/business/relatorios', { ...base, dias: String(days) }, p)} empty="Nenhum fechamento neste período e filtro."
        columns={[
          { key: 'd', header: 'Fechamento', cell: (r) => <Link href={`/admin/business/caixa/fechamentos/${r.id}`} className="font-semibold text-brand hover:underline">{dayLabel(r.c.session.dayOffset)} · {unitName(r.c.session.unitId)}</Link> },
          { key: 'v', header: 'Vendido', cell: (r) => formatMoney(r.c.totals.salesTotalCents), className: 'tabular' },
          { key: 'x', header: 'Despesas', cell: (r) => formatMoney(r.c.totals.expensesCents), className: 'tabular' },
          { key: 'a', header: 'Baixar', cell: (r) => <span className="flex gap-3"><a href={`/admin/business/caixa/fechamentos/${r.id}/arquivo?formato=xlsx`} className="font-semibold text-brand underline">Excel</a><a href={`/admin/business/caixa/fechamentos/${r.id}/arquivo?formato=pdf`} className="font-semibold text-brand underline">PDF</a></span> },
        ]} />
    </>
  );
}
