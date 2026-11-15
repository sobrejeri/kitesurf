import { INSTRUCTOR_TABS, SectionTabs } from '@/components/business/company-kit';
import { DataTable, DemoBanner, PageHead } from '@/components/business/kit';
import { Badge, Note } from '@/components/ui';
import { UNITS } from '@/lib/business/demo';
import { queueFor } from '@/lib/business/instructors';
import { dayLabel, instructorName, parseScope, unitsInScope } from '@/lib/business/rules';

export const metadata = { title: 'Fila interna de instrutores' };

export default async function InternalQueue({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseScope(await searchParams); const units = unitsInScope(scope).filter((u) => u.active && UNITS.some((x) => x.id === u.id));
  return (
    <>
      <DemoBanner />
      <PageHead title="Fila interna de instrutores" subtitle="Quem trabalhou menos nos últimos 7 dias vem primeiro; empate vai para quem espera há mais tempo." />
      <SectionTabs label="Seções de instrutores" tabs={INSTRUCTOR_TABS} active="/admin/business/instrutores/fila" />
      <div className="grid gap-5">
        {units.map((u) => (
          <section key={u.id} aria-label={u.name}><h2 className="mb-2 text-[15px] font-semibold text-ink">{u.name}</h2>
            <DataTable rows={queueFor(u.id).map((q, k) => ({ ...q, id: q.instructorId, pos: k + 1 }))} page={1} pageSize={10} hrefForPage={() => '#'} empty="Ninguém ativo nesta unidade."
              columns={[{ key: 'p', header: 'Posição', cell: (q) => <span className="font-bold">{q.pos}º</span>, className: 'tabular' }, { key: 'n', header: 'Instrutor', cell: (q) => instructorName(q.instructorId) }, { key: 'r', header: 'Aulas em 7 dias', cell: (q) => q.recent, className: 'tabular' },
                { key: 'l', header: 'Última aula', cell: (q) => (q.lastOffset === null ? 'Nenhuma' : dayLabel(q.lastOffset)), className: 'tabular' }, { key: 'v', header: 'Fila única VentoKite', cell: (q) => <Badge tone={q.vento ? 'brand' : 'quiet'}>{q.vento ? 'Participa' : 'Só desta escola'}</Badge> }]} /></section>))}
      </div>
      <Note className="mt-4" title="Duas filas, sem conflito">Esta é a fila da escola. Quem participa da fila única do VentoKite também recebe aulas de lá, e a agenda única impede dois horários ao mesmo tempo.</Note>
    </>
  );
}
