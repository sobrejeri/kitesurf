import { Panel } from '@/components/admin/kit';
import { INSTRUCTOR_TABS, SectionTabs } from '@/components/business/company-kit';
import { AssignForm } from '@/components/business/instructor-forms';
import { DemoBanner, PageHead } from '@/components/business/kit';
import { Badge, EmptyState } from '@/components/ui';
import { LESSON_REQUESTS } from '@/lib/business/demo';
import { currentContext } from '@/lib/business/bookings';
import { eligibleInstructors, queueFor, requestService, suggestions } from '@/lib/business/instructors';
import { dayLabel, instructorName, parseScope, unitName, unitsInScope } from '@/lib/business/rules';

export const metadata = { title: 'Distribuição de aulas' };

export default async function Distribution({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseScope(await searchParams); const ids = new Set(unitsInScope(scope).map((u) => u.id)); const ctx = currentContext();
  const rows = LESSON_REQUESTS.filter((r) => ids.has(r.unitId));
  return (
    <>
      <DemoBanner />
      <PageHead title="Distribuição de aulas" subtitle="Aulas sem instrutor, com sugestão pela fila interna. Só quem tem vínculo, serviço e horário livre pode receber." />
      <SectionTabs label="Seções de instrutores" tabs={INSTRUCTOR_TABS} active="/admin/business/instrutores/distribuicao" />
      <div className="grid gap-4">
        {rows.length === 0 ? <EmptyState>Nenhuma aula aguardando instrutor neste filtro.</EmptyState> : rows.map((r) => {
          const sug = suggestions(r, ctx); const out = queueFor(r.unitId).filter((q) => !eligibleInstructors(r, ctx).includes(q.instructorId));
          return (
            <Panel key={r.id} title={`${requestService(r)?.name} · ${unitName(r.unitId)}`}>
              <p className="text-[13px] text-muted">{r.customer} · {dayLabel(r.dayOffset)}, {r.start}</p>
              <p className="mt-2 text-[13px] text-ink">{sug.length ? <>Sugestão, na ordem da fila: {sug.map((s, k) => <Badge key={s} tone={k === 0 ? 'success' : 'brand'}>{k + 1}. {instructorName(s)}</Badge>)}</> : 'Ninguém disponível neste horário.'}</p>
              {out.length ? <p className="mt-1 text-[12px] text-muted">Fora da sugestão: {out.map((q) => instructorName(q.instructorId)).join(', ')} (horário ocupado ou serviço não habilitado).</p> : null}
              <AssignForm requestId={r.id} />
            </Panel>); })}
      </div>
    </>
  );
}
