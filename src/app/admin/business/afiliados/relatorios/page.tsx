import Link from 'next/link';

import { AffiliateTabs, CommissionBadge, PaymentNotice } from '@/components/business/affiliate-kit';
import { DataTable, DemoBanner, PageHead, Stat, pageHref } from '@/components/business/kit';
import { COMPANY_AFFILIATES } from '@/lib/business/demo';
import { affiliateOf, commissionCents, commissionState, offerName, rateAt, bpsLabel, salesInScope, totalsFor } from '@/lib/business/affiliates';
import { dayLabel, parseScope, scopeQuery, unitName, unitsInScope } from '@/lib/business/rules';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Vendas atribuídas' };

export default async function AttributedSales({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const scope = parseScope(params); const q = scopeQuery(scope);
  const aff = typeof params.afiliado === 'string' && COMPANY_AFFILIATES.some((a) => a.id === params.afiliado) ? params.afiliado : '';
  const page = Number(typeof params.pagina === 'string' ? params.pagina : 1) || 1;
  const all = salesInScope(new Set(unitsInScope(scope).map((u) => u.id))); const rows = all.filter((s) => !aff || s.affiliateId === aff); const t = totalsFor(rows);
  const base: Record<string, string> = scope.unidade ? { unidade: scope.unidade } : scope.cidade ? { cidade: scope.cidade } : {};
  const chip = (id: string, label: string) => <Link key={id} href={pageHref('/admin/business/afiliados/relatorios', id ? { ...base, afiliado: id } : base, 1)} aria-current={aff === id ? 'page' : undefined} className={`press inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold ${aff === id ? 'border-brand bg-brand text-on-brand' : 'border-line-ghost text-ink hover:bg-brand-wash'}`}>{label}</Link>;
  return (
    <>
      <DemoBanner />
      <PageHead title="Vendas atribuídas" subtitle="Vendas feitas pelo link ou pelo cupom de cada afiliado, com o percentual da época da venda." />
      <AffiliateTabs active="/admin/business/afiliados/relatorios" query={q} />
      <PaymentNotice />
      <nav aria-label="Filtro de afiliado" className="mb-3 flex flex-wrap gap-1.5">{chip('', 'Todos')}{COMPANY_AFFILIATES.map((a) => chip(a.id, a.name))}</nav>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Vendas elegíveis" value={String(t.sales)} /><Stat label="Valor elegível" value={formatMoney(t.baseCents)} />
        <Stat label="Comissão a pagar" value={formatMoney(t.dueCents)} /><Stat label="Revertidas" value={String(t.reversedCount)} hint="Canceladas ou estornadas" />
      </div>
      <DataTable rows={rows} page={page} pageSize={6} hrefForPage={(n) => pageHref('/admin/business/afiliados/relatorios', aff ? { ...base, afiliado: aff } : base, n)} empty="Nenhuma venda atribuída neste filtro."
        columns={[{ key: 'o', header: 'Pedido', cell: (s) => <span className="font-semibold">{s.order}</span> }, { key: 'a', header: 'Afiliado', cell: (s) => affiliateOf(s.affiliateId)?.name }, { key: 'i', header: 'Item', cell: (s) => `${offerName(s.refId)} · ${unitName(s.unitId)}` },
          { key: 'v', header: 'Via', cell: (s) => (s.via === 'link' ? `Link ${s.code}` : `Cupom ${s.code}`) }, { key: 'd', header: 'Data', cell: (s) => dayLabel(s.dayOffset), className: 'tabular' }, { key: 'b', header: 'Valor', cell: (s) => formatMoney(s.baseCents), className: 'tabular' },
          { key: 'r', header: 'Comissão', cell: (s) => `${formatMoney(commissionCents(s))} (${bpsLabel(rateAt(s.refId, s.dayOffset))})`, className: 'tabular' }, { key: 's', header: 'Situação', cell: (s) => <CommissionBadge state={commissionState(s)} /> }]} />
    </>
  );
}
