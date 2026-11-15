import { INSTRUCTOR_TABS, SectionTabs } from '@/components/business/company-kit';
import { DataTable, DemoBanner, PageHead, Stat } from '@/components/business/kit';
import { INSTRUCTORS } from '@/lib/business/demo';
import { historyInScope, performanceOf } from '@/lib/business/instructors';
import { parseScope, scopeQuery, unitsInScope } from '@/lib/business/rules';
import { formatBps, formatMinutes, formatMoney } from '@/lib/format';

export const metadata = { title: 'Desempenho dos instrutores' };

export default async function PerformancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseScope(await searchParams); const rows = historyInScope(new Set(unitsInScope(scope).map((u) => u.id)));
  const perf = INSTRUCTORS.map((i) => ({ id: i.id, name: i.name, ...performanceOf(i.id, rows) })).filter((p) => p.done + p.cancelled + p.noShow > 0).sort((a, b) => b.done - a.done);
  const sum = (f: (p: (typeof perf)[number]) => number) => perf.reduce((n, p) => n + f(p), 0);
  const lessons = sum((p) => p.done + p.cancelled + p.noShow);
  return (
    <>
      <DemoBanner />
      <PageHead title="Desempenho dos instrutores" subtitle="Aulas concluídas, cancelamentos, faltas e o que cada um gerou, só nas unidades deste filtro." />
      <SectionTabs label="Seções de instrutores" tabs={INSTRUCTOR_TABS} active="/admin/business/instrutores/desempenho" query={scopeQuery(scope)} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Aulas concluídas" value={String(sum((p) => p.done))} hint={`${lessons} no total`} /><Stat label="Conclusão" value={formatBps(lessons ? Math.floor((sum((p) => p.done) * 10000) / lessons) : 0)} />
        <Stat label="Valor das aulas" value={formatMoney(sum((p) => p.baseCents))} /><Stat label="Comissões devidas" value={formatMoney(sum((p) => p.commissionCents))} hint="A pagar fora do VentoKite" />
      </div>
      <DataTable rows={perf} page={1} pageSize={10} hrefForPage={() => '#'} empty="Sem aulas neste filtro."
        columns={[{ key: 'n', header: 'Instrutor', cell: (p) => <span className="font-semibold">{p.name}</span> }, { key: 'd', header: 'Concluídas', cell: (p) => p.done, className: 'tabular' }, { key: 'c', header: 'Canceladas', cell: (p) => p.cancelled, className: 'tabular' }, { key: 'f', header: 'Faltas', cell: (p) => p.noShow, className: 'tabular' },
          { key: 'r', header: 'Conclusão', cell: (p) => formatBps(p.completionBps), className: 'tabular' }, { key: 'h', header: 'Tempo', cell: (p) => formatMinutes(p.minutes), className: 'tabular' }, { key: 'v', header: 'Valor', cell: (p) => formatMoney(p.baseCents), className: 'tabular' }, { key: 'm', header: 'Comissão', cell: (p) => formatMoney(p.commissionCents), className: 'tabular' }]} />
    </>
  );
}
