import Link from 'next/link';

import { DataTable, DemoBanner, PageHead, pageHref } from '@/components/business/kit';
import { Badge, ButtonLink, type BadgeTone } from '@/components/ui';
import { EXTERNAL_BOOKINGS, type ExternalStatus } from '@/lib/business/demo';
import { STATUS_LABEL, bookingEnd } from '@/lib/business/bookings';
import { dayLabel, instructorName, parseScope, scopeQuery, unitName, unitsInScope } from '@/lib/business/rules';
import { serviceOf } from '@/lib/business/services';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Reservas presenciais' };
const TONE: Record<ExternalStatus, BadgeTone> = { confirmed: 'brand', done: 'success', cancelled: 'quiet' };
const FILTERS: { id: '' | ExternalStatus; label: string }[] = [{ id: '', label: 'Todas' }, { id: 'confirmed', label: 'Confirmadas' }, { id: 'done', label: 'Realizadas' }, { id: 'cancelled', label: 'Canceladas' }];

export default async function ExternalBookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const scope = parseScope(params);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const status = FILTERS.some((f) => f.id === one(params.status)) ? one(params.status) : '';
  const page = Number(one(params.pagina)) || 1;
  const base: Record<string, string> = Object.fromEntries(new URLSearchParams(scopeQuery(scope).slice(1)));
  const keep = status ? { ...base, status } : base;
  const ids = new Set(unitsInScope(scope).map((u) => u.id));
  const rows = EXTERNAL_BOOKINGS.filter((b) => ids.has(b.unitId) && (!status || b.status === status));
  return (
    <>
      <DemoBanner />
      <PageHead title="Reservas presenciais" subtitle="Reservas feitas no balcão. Usam a mesma agenda das reservas digitais."
        action={<ButtonLink href={`/admin/business/reservas/nova${scopeQuery(scope)}`} size="sm" icon="plus">Nova reserva</ButtonLink>} />
      <nav aria-label="Filtrar por situação" className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link key={f.id} href={pageHref('/admin/business/reservas', f.id ? { ...base, status: f.id } : base, 1)} aria-current={status === f.id ? 'true' : undefined}
            className={`press rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${status === f.id ? 'border-brand bg-brand text-on-brand' : 'border-line-ghost text-ink hover:bg-brand-wash'}`}>{f.label}</Link>
        ))}
      </nav>
      <DataTable rows={rows} page={page} pageSize={6} hrefForPage={(p) => pageHref('/admin/business/reservas', keep, p)} empty="Nenhuma reserva presencial neste filtro."
        columns={[
          { key: 'c', header: 'Reserva', cell: (b) => <Link href={`/admin/business/reservas/${b.id}${scopeQuery(scope)}`} className="font-semibold text-brand hover:underline">{b.code}</Link> },
          { key: 'w', header: 'Quando', cell: (b) => `${dayLabel(b.dayOffset)}, ${b.start}–${bookingEnd(b)}`, className: 'tabular' },
          { key: 's', header: 'Serviço', cell: (b) => `${serviceOf(b.serviceId)?.name} · ${unitName(b.unitId)}` },
          { key: 'i', header: 'Instrutor', cell: (b) => instructorName(b.instructorId) },
          { key: 'v', header: 'Valor', cell: (b) => formatMoney(b.priceCents), className: 'tabular' },
          { key: 't', header: 'Situação', cell: (b) => <Badge tone={TONE[b.status]}>{STATUS_LABEL[b.status]}</Badge> },
        ]} />
    </>
  );
}
