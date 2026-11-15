import { DemoBanner, PageHead } from '@/components/business/kit';
import { Badge, EmptyState, Note } from '@/components/ui';
import { dayLabel, endTime, findConflicts, instructorName, lessonsInScope, parseScope, unitName } from '@/lib/business/rules';

export const metadata = { title: 'Agenda' };

export default async function BusinessAgendaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseScope(await searchParams);
  const lessons = lessonsInScope(scope);
  // Conflicts are judged on the whole company, not only on the filter: one instructor, one calendar.
  const conflicts = findConflicts(lessonsInScope({ cidade: '', unidade: '' }));
  const days = [...new Set(lessons.map((l) => l.dayOffset))].sort((a, b) => a - b);
  return (
    <>
      <DemoBanner />
      <PageHead title="Agenda" subtitle={scope.unidade ? `Unidade ${unitName(scope.unidade)}` : scope.cidade ? `Cidade ${scope.cidade}` : 'Agenda geral da empresa'} />
      {days.length === 0 ? <EmptyState>Nenhuma aula agendada neste filtro.</EmptyState> : days.map((d) => (
        <section key={d} className="mb-5" aria-labelledby={`dia-${d}`}>
          <h2 id={`dia-${d}`} className="mb-2 text-[14px] font-semibold capitalize text-ink">{dayLabel(d)}{d === 0 ? ' · hoje' : ''}</h2>
          <ul className="grid gap-2">
            {lessons.filter((l) => l.dayOffset === d).sort((a, b) => a.start.localeCompare(b.start)).map((l) => (
              <li key={l.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[14px] border bg-surface p-3 text-[13px] ${conflicts.has(l.id) ? 'border-danger' : 'border-line'}`}>
                <strong className="tabular w-[104px] shrink-0 text-ink">{l.start}–{endTime(l.start, l.minutes)}</strong>
                <span className="min-w-0 flex-1"><span className="font-semibold text-ink">{l.service}</span><span className="block text-muted">{instructorName(l.instructorId)} · {unitName(l.unitId)}</span></span>
                <Badge tone={l.origin === 'digital' ? 'brand' : 'quiet'}>{l.origin === 'digital' ? 'Reserva digital' : 'Reserva presencial'}</Badge>
                {conflicts.has(l.id) ? <Badge tone="danger">Conflito de horário</Badge> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <Note className="mt-2" title="Agenda única">O mesmo instrutor não pode estar em duas unidades no mesmo horário. Conflitos aparecem em vermelho e a validação definitiva fica no banco, igual às reservas digitais.</Note>
    </>
  );
}
