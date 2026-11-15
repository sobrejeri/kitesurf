import { Badge, Note } from '@/components/ui';
import { DataTable, DemoBanner, PageHead, pageHref } from '@/components/business/kit';
import { UNITS } from '@/lib/business/demo';
import { parseScope, scopeQuery, unitName } from '@/lib/business/rules';
import { effectivePriceCents, hasOwnPrice, serviceOf, unitServicesInScope } from '@/lib/business/services';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Preços por unidade' };

export default async function PricesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const scope = parseScope(params);
  const page = Number(Array.isArray(params.pagina) ? params.pagina[0] : params.pagina) || 1;
  const keep: Record<string, string> = Object.fromEntries(new URLSearchParams(scopeQuery(scope).slice(1)));
  const rows = unitServicesInScope(scope).map((u) => ({ ...u, id: `${u.serviceId}:${u.unitId}` }));
  return (
    <>
      <DemoBanner />
      <PageHead title="Preços por cidade e unidade" subtitle="O preço que cada unidade pratica na loja da escola." />
      <DataTable rows={rows} page={page} pageSize={6} hrefForPage={(p) => pageHref('/admin/business/precos', keep, p)} empty="Nenhum serviço habilitado neste filtro."
        columns={[
          { key: 's', header: 'Serviço', cell: (r) => serviceOf(r.serviceId)?.name ?? 'Serviço' },
          { key: 'u', header: 'Unidade', cell: (r) => unitName(r.unitId) },
          { key: 'c', header: 'Cidade', cell: (r) => UNITS.find((u) => u.id === r.unitId)?.city ?? '' },
          { key: 'p', header: 'Preço', cell: (r) => { const s = serviceOf(r.serviceId); return s ? formatMoney(effectivePriceCents(s, r)) : '—'; }, className: 'tabular' },
          { key: 'o', header: 'Origem', cell: (r) => <Badge tone={hasOwnPrice(r) ? 'brand' : 'quiet'}>{hasOwnPrice(r) ? 'Preço da unidade' : 'Preço base'}</Badge> },
        ]} />
      <Note className="mt-4" title="Quem define cada preço">Os preços da fila única são definidos pelo VentoKite e não aparecem aqui. Estes são os preços da loja da própria escola.</Note>
    </>
  );
}
