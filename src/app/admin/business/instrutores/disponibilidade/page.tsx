import Link from 'next/link';

import { Panel } from '@/components/admin/kit';
import { INSTRUCTOR_TABS, SectionTabs } from '@/components/business/company-kit';
import { AvailabilityForm } from '@/components/business/instructor-forms';
import { DemoBanner, PageHead } from '@/components/business/kit';
import { Badge, Note } from '@/components/ui';
import { INSTRUCTORS } from '@/lib/business/demo';
import { currentContext } from '@/lib/business/bookings';
import { busyOf, freeStarts, linkOf, weekdayOf, windowsOf, WEEKDAY_NAME } from '@/lib/business/instructors';
import { dayLabel } from '@/lib/business/rules';

export const metadata = { title: 'Disponibilidade e horários' };
const BUSY = { here: 'Aula nesta escola', booking: 'Reserva presencial', other: 'Ocupado em outra escola' } as const;

export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const active = INSTRUCTORS.filter((i) => i.status === 'active');
  const i = (typeof params.instrutor === 'string' ? linkOf(params.instrutor) : undefined) ?? active[0]; const ctx = currentContext();
  return (
    <>
      <DemoBanner />
      <PageHead title="Disponibilidade e horários" subtitle="Uma agenda só por instrutor, somando todas as unidades e escolas." />
      <SectionTabs label="Seções de instrutores" tabs={INSTRUCTOR_TABS} active="/admin/business/instrutores/disponibilidade" />
      <nav aria-label="Instrutor" className="mb-3 flex flex-wrap gap-1.5">{active.map((a) => <Link key={a.id} href={`/admin/business/instrutores/disponibilidade?instrutor=${a.id}`} aria-current={i?.id === a.id ? 'page' : undefined} className={`press inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold ${i?.id === a.id ? 'border-brand bg-brand text-on-brand' : 'border-line-ghost text-ink hover:bg-brand-wash'}`}>{a.name}</Link>)}</nav>
      {i ? (
        <div className="grid gap-3">
          {Array.from({ length: 7 }, (_, d) => d).map((d) => { const wins = windowsOf(i.id, weekdayOf(ctx, d)); const busy = busyOf(i.id, d); const free = freeStarts(i.id, d, 60, ctx);
            return (
              <Panel key={d} title={`${dayLabel(d)} · ${WEEKDAY_NAME[weekdayOf(ctx, d)]}`}>
                {wins.length === 0 ? <p className="text-[13px] text-muted">Não atende neste dia.</p> : (
                  <div className="grid gap-2 text-[13px]">
                    <p className="text-muted">Janela: {wins.map((w) => `${w.from} às ${w.to}`).join(' e ')}</p>
                    {busy.length ? <p className="flex flex-wrap gap-1.5">{busy.map((b, k) => <Badge key={k} tone={b.kind === 'other' ? 'quiet' : 'brand'}>{b.start} · {b.minutes} min · {BUSY[b.kind]}</Badge>)}</p> : null}
                    <p className="text-ink">{free.length ? `Início livre para aula de 1 h: ${free.join(', ')}` : 'Sem horário livre para aula de 1 h.'}</p>
                  </div>)}
              </Panel>); })}
          <h2 className="mt-3 text-[15px] font-semibold text-ink">Nova janela semanal de {i.name}</h2>
          <AvailabilityForm instructorId={i.id} />
        </div>) : null}
      <Note className="mt-4" title="Disponibilidade unificada">Aulas em qualquer unidade ou escola ocupam o mesmo horário. O que for de outra empresa aparece só como “ocupado”.</Note>
    </>
  );
}
