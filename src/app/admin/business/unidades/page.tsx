import Link from 'next/link';

import { DataTable, DemoBanner, PageHead, pageHref } from '@/components/business/kit';
import { Badge, ButtonLink } from '@/components/ui';
import { EMPLOYEES, INSTRUCTORS } from '@/lib/business/demo';
import { parseScope, scopeQuery, unitsInScope } from '@/lib/business/rules';

export const metadata = { title: 'Unidades' };

export default async function UnitsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const scope = parseScope(params);
  const page = Number(Array.isArray(params.pagina) ? params.pagina[0] : params.pagina) || 1;
  const units = unitsInScope(scope);
  const keep: Record<string, string> = Object.fromEntries(new URLSearchParams(scopeQuery(scope).slice(1)));
  return (
    <>
      <DemoBanner />
      <PageHead title="Unidades" subtitle="Cada unidade tem cidade, endereço, horários, equipe e agenda próprios."
        action={<ButtonLink href={`/admin/business/unidades/nova${scopeQuery(scope)}`} size="sm" icon="plus">Nova unidade</ButtonLink>} />
      <DataTable rows={units} page={page} pageSize={5} hrefForPage={(p) => pageHref('/admin/business/unidades', keep, p)} empty="Nenhuma unidade neste filtro."
        columns={[
          { key: 'n', header: 'Unidade', cell: (u) => <Link href={`/admin/business/unidades/${u.id}`} className="font-semibold text-brand hover:underline">{u.name}</Link> },
          { key: 'c', header: 'Cidade', cell: (u) => u.city },
          { key: 'e', header: 'Endereço', cell: (u) => u.address },
          { key: 'h', header: 'Horário', cell: (u) => `${u.opens}–${u.closes}`, className: 'tabular' },
          { key: 'f', header: 'Equipe', cell: (u) => `${EMPLOYEES.filter((e) => e.assignments.some((a) => a.unitId === u.id)).length} func. · ${INSTRUCTORS.filter((i) => i.unitIds.includes(u.id)).length} instr.` },
          { key: 's', header: 'Situação', cell: (u) => <Badge tone={u.active ? 'success' : 'quiet'}>{u.active ? 'Ativa' : 'Inativa'}</Badge> },
        ]} />
    </>
  );
}
