import { DataTable, DemoBanner, LinkBadge, PageHead, pageHref } from '@/components/business/kit';
import { Badge, Note } from '@/components/ui';
import { formatBps } from '@/lib/format';
import { instructorsInScope, parseScope, scopeQuery, unitName } from '@/lib/business/rules';

export const metadata = { title: 'Instrutores' };

export default async function BusinessInstructorsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const scope = parseScope(params);
  const page = Number(Array.isArray(params.pagina) ? params.pagina[0] : params.pagina) || 1;
  const keep: Record<string, string> = Object.fromEntries(new URLSearchParams(scopeQuery(scope).slice(1)));
  return (
    <>
      <DemoBanner />
      <PageHead title="Instrutores vinculados" subtitle="Um instrutor pode atuar em várias unidades e escolas, com uma única agenda." />
      <DataTable rows={instructorsInScope(scope)} page={page} pageSize={5} hrefForPage={(p) => pageHref('/admin/business/instrutores', keep, p)} empty="Nenhum instrutor vinculado neste filtro."
        columns={[
          { key: 'n', header: 'Instrutor', cell: (i) => i.name },
          { key: 's', header: 'Vínculo', cell: (i) => <LinkBadge status={i.status} /> },
          { key: 'u', header: 'Unidades', cell: (i) => i.unitIds.map(unitName).join(', ') },
          { key: 'c', header: 'Comissão', cell: (i) => formatBps(i.commissionBps), className: 'tabular' },
          { key: 'q', header: 'Fila única VentoKite', cell: (i) => <Badge tone={i.independentQueue ? 'brand' : 'quiet'}>{i.independentQueue ? 'Participa' : 'Só desta escola'}</Badge> },
        ]} />
      <Note className="mt-4" title="Regras do vínculo">Suspender um instrutor nesta escola não o bloqueia no VentoKite. A disponibilidade é unificada: uma aula em qualquer unidade ou escola ocupa o mesmo horário. Esta escola não vê reservas privadas de outras empresas.</Note>
    </>
  );
}
