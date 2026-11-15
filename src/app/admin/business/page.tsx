import Link from 'next/link';

import { DataTable, DemoBanner, PageHead, Stat, pageHref } from '@/components/business/kit';
import { Panel, PanelLink } from '@/components/admin/kit';
import { Badge, EmptyState } from '@/components/ui';
import { COMPANY, INSTRUCTORS } from '@/lib/business/demo';
import { employeesInScope, endTime, findConflicts, instructorName, instructorsInScope, lessonsInScope, parseScope, scopeQuery, unitName, unitsInScope } from '@/lib/business/rules';

export const metadata = { title: 'Dashboard' };

export default async function BusinessDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const scope = parseScope(params);
  const q = scopeQuery(scope);
  const units = unitsInScope(scope);
  const lessons = lessonsInScope(scope);
  const conflicts = findConflicts(lessons);
  const today = lessons.filter((l) => l.dayOffset === 0).sort((a, b) => a.start.localeCompare(b.start));
  const pending = INSTRUCTORS.filter((i) => i.status === 'invited');
  const label = scope.unidade ? unitName(scope.unidade) : scope.cidade || 'Visão consolidada';

  return (
    <>
      <DemoBanner />
      <PageHead title="Dashboard" subtitle={`${COMPANY.name} · ${label}`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Unidades ativas" value={String(units.filter((u) => u.active).length)} hint={`${units.length} no filtro`} />
        <Stat label="Aulas hoje" value={String(today.length)} hint={conflicts.size ? `${conflicts.size} com conflito` : 'Sem conflitos'} />
        <Stat label="Funcionários" value={String(employeesInScope(scope).length)} />
        <Stat label="Instrutores ativos" value={String(instructorsInScope(scope).filter((i) => i.status === 'active').length)} hint={`${pending.length} convite(s) pendente(s)`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Unidades" action={<PanelLink href={`/admin/business/unidades${q}`} label="Ver todas" />}>
          <DataTable rows={units} page={1} pageSize={6} hrefForPage={(p) => pageHref('/admin/business', {}, p)} empty="Nenhuma unidade neste filtro."
            columns={[
              { key: 'n', header: 'Unidade', cell: (u) => <Link href={`/admin/business/unidades/${u.id}`} className="font-semibold text-brand hover:underline">{u.name}</Link> },
              { key: 'c', header: 'Cidade', cell: (u) => u.city },
              { key: 'a', header: 'Aulas hoje', cell: (u) => String(lessons.filter((l) => l.unitId === u.id && l.dayOffset === 0).length), className: 'tabular' },
              { key: 's', header: 'Situação', cell: (u) => <Badge tone={u.active ? 'success' : 'quiet'}>{u.active ? 'Ativa' : 'Inativa'}</Badge> },
            ]} />
        </Panel>
        <Panel title="Agenda de hoje" action={<PanelLink href={`/admin/business/agenda${q}`} label="Agenda" />}>
          {today.length === 0 ? <EmptyState>Nenhuma aula hoje neste filtro.</EmptyState> : (
            <ul className="divide-y divide-line">
              {today.map((l) => (
                <li key={l.id} className="py-2.5 text-[13px]">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="tabular text-ink">{l.start}–{endTime(l.start, l.minutes)}</strong>
                    {conflicts.has(l.id) ? <Badge tone="danger">Conflito</Badge> : <Badge tone="quiet">{l.origin === 'digital' ? 'Digital' : 'Presencial'}</Badge>}
                  </div>
                  <p className="text-muted">{l.service} · {instructorName(l.instructorId)} · {unitName(l.unitId)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
