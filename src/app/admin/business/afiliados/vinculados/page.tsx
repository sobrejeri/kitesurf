import { AffiliateTabs } from '@/components/business/affiliate-kit';
import { DataTable, DemoBanner, PageHead } from '@/components/business/kit';
import { Badge } from '@/components/ui';
import { COMPANY_AFFILIATES } from '@/lib/business/demo';
import { salesInScope, selectionOf, totalsFor } from '@/lib/business/affiliates';
import { dayLabel, parseScope, scopeQuery, unitsInScope } from '@/lib/business/rules';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Afiliados vinculados' };
const KIND = { pousada: 'Pousada', loja: 'Loja', influenciador: 'Influenciador' } as const;

export default async function LinkedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseScope(await searchParams); const q = scopeQuery(scope);
  const sales = salesInScope(new Set(unitsInScope(scope).map((u) => u.id)));
  return (
    <>
      <DemoBanner />
      <PageHead title="Afiliados vinculados" subtitle="Código de divulgação, cupom rastreável e resultado de cada afiliado." />
      <AffiliateTabs active="/admin/business/afiliados/vinculados" query={q} />
      <DataTable rows={COMPANY_AFFILIATES} page={1} pageSize={10} hrefForPage={() => '#'} empty="Nenhum afiliado vinculado."
        columns={[{ key: 'n', header: 'Afiliado', cell: (a) => <span className="font-semibold">{a.name}</span> }, { key: 'k', header: 'Tipo', cell: (a) => `${KIND[a.kind]} · ${a.city}` },
          { key: 'c', header: 'Link / cupom', cell: (a) => <span className="tabular">?ref={a.code}{a.couponCode ? ` · ${a.couponCode}` : ''}</span> }, { key: 'd', header: 'Desde', cell: (a) => dayLabel(a.sinceOffset), className: 'tabular' },
          { key: 'i', header: 'Divulga', cell: (a) => `${selectionOf(a.id).length} item(ns)` }, { key: 'v', header: 'Vendido', cell: (a) => formatMoney(totalsFor(sales.filter((s) => s.affiliateId === a.id)).baseCents), className: 'tabular' },
          { key: 's', header: 'Situação', cell: (a) => (a.status === 'active' ? <Badge tone="success">Ativo</Badge> : <Badge tone="danger">Suspenso</Badge>) }]} />
      <p className="mt-3 max-w-2xl text-[12.5px] text-muted">O link é um exemplo: a página pública ainda não existe. Venda feita pelo link ou pelo cupom do afiliado fica atribuída a ele.</p>
    </>
  );
}
