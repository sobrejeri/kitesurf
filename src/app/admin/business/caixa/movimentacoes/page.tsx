import Link from 'next/link';

import { DataTable, DemoBanner, PageHead, pageHref } from '@/components/business/kit';
import { Badge, ButtonLink } from '@/components/ui';
import { CASH_MOVEMENTS, CASH_SESSIONS, type MovementKind } from '@/lib/business/demo';
import { KIND_LABEL, METHOD_LABEL } from '@/lib/business/caixa';
import { dayLabel, parseScope, scopeQuery, unitName, unitsInScope } from '@/lib/business/rules';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Movimentações do caixa' };
const FILTERS: { id: '' | MovementKind; label: string }[] = [{ id: '', label: 'Todas' }, { id: 'sale', label: 'Vendas' }, { id: 'supply', label: 'Suprimentos' }, { id: 'bleed', label: 'Sangrias' }, { id: 'expense', label: 'Despesas' }];

export default async function MovementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const scope = parseScope(params);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const kind = FILTERS.some((f) => f.id === one(params.tipo)) ? one(params.tipo) : '';
  const page = Number(one(params.pagina)) || 1;
  const base: Record<string, string> = Object.fromEntries(new URLSearchParams(scopeQuery(scope).slice(1)));
  const ids = new Set(unitsInScope(scope).map((u) => u.id));
  const rows = CASH_MOVEMENTS.filter((m) => { const s = CASH_SESSIONS.find((x) => x.id === m.sessionId); return s && ids.has(s.unitId) && (!kind || m.kind === kind); });
  return (
    <>
      <DemoBanner />
      <PageHead title="Movimentações" subtitle="Vendas presenciais, sangrias, suprimentos e despesas." action={<ButtonLink href={`/admin/business/caixa/movimentacoes/nova${scopeQuery(scope)}`} size="sm" icon="plus">Registrar</ButtonLink>} />
      <nav aria-label="Filtrar por tipo" className="mb-3 flex flex-wrap gap-2">{FILTERS.map((f) => (
        <Link key={f.id} href={pageHref('/admin/business/caixa/movimentacoes', f.id ? { ...base, tipo: f.id } : base, 1)} aria-current={kind === f.id ? 'true' : undefined}
          className={`press rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${kind === f.id ? 'border-brand bg-brand text-on-brand' : 'border-line-ghost text-ink hover:bg-brand-wash'}`}>{f.label}</Link>))}</nav>
      <DataTable rows={rows} page={page} pageSize={8} hrefForPage={(p) => pageHref('/admin/business/caixa/movimentacoes', kind ? { ...base, tipo: kind } : base, p)} empty="Nenhuma movimentação neste filtro."
        columns={[
          { key: 't', header: 'Tipo', cell: (m) => <span className="font-semibold">{KIND_LABEL[m.kind]}</span> },
          { key: 'h', header: 'Quando', cell: (m) => { const s = CASH_SESSIONS.find((x) => x.id === m.sessionId); return `${dayLabel(s?.dayOffset ?? 0)}, ${m.time}`; }, className: 'tabular' },
          { key: 'u', header: 'Unidade', cell: (m) => unitName(CASH_SESSIONS.find((x) => x.id === m.sessionId)?.unitId ?? '') },
          { key: 'f', header: 'Forma', cell: (m) => (m.method ? <Badge tone={m.method === 'cash' ? 'quiet' : 'brand'}>{METHOD_LABEL[m.method]}</Badge> : '—') },
          { key: 'd', header: 'Descrição', cell: (m) => m.note },
          { key: 'v', header: 'Valor', cell: (m) => formatMoney(m.cents), className: 'tabular' },
        ]} />
    </>
  );
}
