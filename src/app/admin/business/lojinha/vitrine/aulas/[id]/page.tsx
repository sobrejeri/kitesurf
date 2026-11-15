import { notFound } from 'next/navigation';

import { AddLessonForm } from '@/components/business/cart';
import { UNIT_SERVICES } from '@/lib/business/demo';
import { instructorName, unitName } from '@/lib/business/rules';
import { effectivePriceCents, serviceOf } from '@/lib/business/services';
import { formatMinutes, formatMoney } from '@/lib/format';

export const metadata = { title: 'Detalhes da aula' };

export default async function LessonDetail({ params }: { params: Promise<{ id: string }> }) {
  const s = serviceOf((await params).id); if (!s) notFound();
  const configs = UNIT_SERVICES.filter((c) => c.serviceId === s.id);
  return (
    <div className="grid gap-4">
      <div><h2 className="text-[22px] font-bold text-ink">{s.name}</h2><p className="mt-1 text-[13px] text-muted">{formatMinutes(s.minutes)} · até {s.capacity} aluno(s) por aula</p><p className="mt-2 max-w-2xl text-[14px] text-ink">{s.description}</p></div>
      <ul className="grid gap-2 sm:grid-cols-3">{configs.map((c) => <li key={c.unitId} className="rounded-[14px] border border-line bg-surface p-3.5 text-[13px]"><p className="font-semibold text-ink">{unitName(c.unitId)}</p><p className="tabular font-bold text-ink">{formatMoney(effectivePriceCents(s, c))}</p><p className="text-muted">{c.place}</p><p className="text-muted">Instrutores: {c.instructorIds.map(instructorName).join(', ')}</p></li>)}</ul>
      <h3 className="text-[15px] font-semibold text-ink">Escolha instrutor, dia e horário</h3>
      <AddLessonForm serviceId={s.id} />
    </div>
  );
}
