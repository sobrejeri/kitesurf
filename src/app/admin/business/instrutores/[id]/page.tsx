import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Panel } from '@/components/admin/kit';
import { INSTRUCTOR_TABS, SectionTabs } from '@/components/business/company-kit';
import { DemoBanner, LinkBadge, PageHead } from '@/components/business/kit';
import { Badge, EmptyState, Note } from '@/components/ui';
import { AVAILABILITY } from '@/lib/business/demo';
import { currentContext } from '@/lib/business/bookings';
import { busyOf, instructorRateAt, linkOf, performanceOf, WEEKDAY_NAME } from '@/lib/business/instructors';
import { LESSON_HISTORY } from '@/lib/business/demo';
import { dayLabel, unitName } from '@/lib/business/rules';
import { formatBps, formatMoney } from '@/lib/format';

export const metadata = { title: 'Perfil do instrutor' };
const BUSY = { here: 'Aula nesta escola', booking: 'Reserva presencial', other: 'Ocupado em outra escola' } as const;

export default async function InstructorProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const i = linkOf(id); if (!i) notFound();
  const ctx = currentContext(); const perf = performanceOf(i.id, LESSON_HISTORY);
  return (
    <>
      <DemoBanner />
      <PageHead title={i.name} subtitle={i.unitIds.map(unitName).join(' · ')} action={<LinkBadge status={i.status} />} />
      <SectionTabs label="Seções de instrutores" tabs={INSTRUCTOR_TABS} active="/admin/business/instrutores" />
      {i.status === 'suspended' ? <Note tone="warning" title="Suspenso nesta escola" className="mb-4">A suspensão vale só aqui. O instrutor segue ativo no VentoKite e em outras escolas.</Note> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Perfil profissional"><dl className="grid gap-2 text-[13px]">
          {([['Fila única VentoKite', i.independentQueue ? 'Participa' : 'Só desta escola'], ['Aulas concluídas', String(perf.done)], ['Conclusão', formatBps(perf.completionBps)], ['Base já gerada', formatMoney(perf.baseCents)]] as const).map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="tabular font-medium text-ink">{v}</dd></div>)}
        </dl></Panel>
        <Panel title="Comissão vigente" action={<Link href={`/admin/business/instrutores/${i.id}/comissao`} className="text-[13px] font-semibold text-brand">Configurar</Link>}>
          <ul className="divide-y divide-line text-[13px]">{i.unitIds.map((u) => <li key={u} className="flex justify-between gap-3 py-2.5"><span className="text-ink">{unitName(u)}</span><span className="tabular font-semibold text-ink">{formatBps(instructorRateAt(i.id, u, 0))}</span></li>)}</ul>
        </Panel>
        <Panel title="Janelas de disponibilidade">{AVAILABILITY.filter((w) => w.instructorId === i.id).length === 0 ? <EmptyState>Sem janelas cadastradas.</EmptyState> : <ul className="divide-y divide-line text-[13px]">{AVAILABILITY.filter((w) => w.instructorId === i.id).map((w) => <li key={w.weekday} className="flex justify-between gap-3 py-2"><span className="capitalize text-ink">{WEEKDAY_NAME[w.weekday]}</span><span className="tabular text-muted">{w.from} às {w.to}</span></li>)}</ul>}</Panel>
        <Panel title="Próximos dias na agenda única"><ul className="divide-y divide-line text-[13px]">{[0, 1, 2].map((d) => <li key={d} className="py-2.5"><strong className="text-ink">{dayLabel(d)}</strong>{busyOf(i.id, d).length === 0 ? <span className="text-muted"> · livre</span> : busyOf(i.id, d).map((b, k) => <span key={k} className="ml-2 inline-block"><Badge tone={b.kind === 'other' ? 'quiet' : 'brand'}>{b.start} · {BUSY[b.kind]}</Badge></span>)}</li>)}</ul></Panel>
      </div>
      <p className="mt-3 text-[12px] text-muted">Hoje é {WEEKDAY_NAME[ctx.weekday0]}. Reservas de outra empresa aparecem só como “ocupado”.</p>
    </>
  );
}
