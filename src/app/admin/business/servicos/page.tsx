import Link from 'next/link';

import { DataTable, DemoBanner, PageHead, pageHref } from '@/components/business/kit';
import { ButtonLink } from '@/components/ui';
import { SERVICES } from '@/lib/business/demo';
import { parseScope, scopeQuery, unitName } from '@/lib/business/rules';
import { unitServicesInScope } from '@/lib/business/services';
import { formatMinutes, formatMoney } from '@/lib/format';

export const metadata = { title: 'Serviços' };

export default async function ServicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const scope = parseScope(params);
  const page = Number(Array.isArray(params.pagina) ? params.pagina[0] : params.pagina) || 1;
  const keep: Record<string, string> = Object.fromEntries(new URLSearchParams(scopeQuery(scope).slice(1)));
  const enabled = unitServicesInScope(scope);
  return (
    <>
      <DemoBanner />
      <PageHead title="Catálogo de serviços" subtitle="Cadastre uma vez e habilite em quantas unidades quiser."
        action={<ButtonLink href={`/admin/business/servicos/novo${scopeQuery(scope)}`} size="sm" icon="plus">Novo serviço</ButtonLink>} />
      <DataTable rows={SERVICES} page={page} pageSize={6} hrefForPage={(p) => pageHref('/admin/business/servicos', keep, p)} empty="Nenhum serviço cadastrado."
        columns={[
          { key: 'n', header: 'Serviço', cell: (s) => <Link href={`/admin/business/servicos/${s.id}${scopeQuery(scope)}`} className="font-semibold text-brand hover:underline">{s.name}</Link> },
          { key: 'd', header: 'Duração', cell: (s) => formatMinutes(s.minutes) },
          { key: 'c', header: 'Capacidade', cell: (s) => `${s.capacity} aluno(s)` },
          { key: 'p', header: 'Preço base', cell: (s) => formatMoney(s.baseCents), className: 'tabular' },
          { key: 'u', header: 'Habilitado em', cell: (s) => {
            const here = enabled.filter((u) => u.serviceId === s.id).map((u) => unitName(u.unitId));
            return here.length ? here.join(', ') : 'Nenhuma unidade neste filtro';
          } },
        ]} />
    </>
  );
}
