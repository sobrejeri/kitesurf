import Link from 'next/link';

import { STAFF_TABS, SectionTabs } from '@/components/business/company-kit';
import { DataTable, DemoBanner, PageHead, RoleBadge, pageHref } from '@/components/business/kit';
import { Button, inputClass } from '@/components/ui';
import { employeesInScope, parseScope, scopeQuery, unitName, unitsInScope } from '@/lib/business/rules';

export const metadata = { title: 'Funcionários' };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const scope = parseScope(params);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const q = one(params.q).trim().toLowerCase();
  const page = Number(one(params.pagina)) || 1;
  const keep: Record<string, string> = Object.fromEntries(new URLSearchParams(scopeQuery(scope).slice(1)));
  if (q) keep.q = one(params.q).trim();
  const rows = employeesInScope(scope).filter((e) => !q || e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q));
  const inScope = (unitId: string) => unitsInScope(scope).some((u) => u.id === unitId);

  return (
    <>
      <DemoBanner />
      <PageHead title="Funcionários" subtitle="Cada pessoa pode ter um cargo diferente em cada unidade." />
      <SectionTabs label="Seções da equipe" tabs={STAFF_TABS} active="/admin/business/funcionarios" query={scopeQuery(scope)} />
      <form method="get" className="mb-3 flex gap-2" role="search">
        {scope.unidade ? <input type="hidden" name="unidade" value={scope.unidade} /> : scope.cidade ? <input type="hidden" name="cidade" value={scope.cidade} /> : null}
        <label className="sr-only" htmlFor="q">Buscar funcionário</label>
        <input id="q" name="q" defaultValue={one(params.q)} placeholder="Buscar por nome ou e-mail" className={`${inputClass} max-w-sm`} />
        <Button type="submit" variant="ghost" size="sm">Buscar</Button>
      </form>
      <DataTable rows={rows} page={page} pageSize={5} hrefForPage={(p) => pageHref('/admin/business/funcionarios', keep, p)}
        empty={q ? 'Nenhum funcionário encontrado para essa busca.' : 'Nenhum funcionário neste filtro.'}
        columns={[
          { key: 'n', header: 'Funcionário', cell: (e) => <span><Link href={`/admin/business/funcionarios/${e.id}`} className="font-semibold text-brand">{e.name}</Link><span className="block text-[12px] font-normal text-muted">{e.email}</span></span> },
          { key: 'u', header: 'Unidades e cargos', cell: (e) => (
            <span className="flex flex-wrap justify-end gap-1.5 lg:justify-start">
              {e.assignments.filter((a) => inScope(a.unitId)).map((a) => (
                <span key={a.unitId} className="inline-flex items-center gap-1.5 text-[12px] text-label">{unitName(a.unitId)} <RoleBadge role={a.role} /></span>
              ))}
            </span>) },
        ]} />
    </>
  );
}
