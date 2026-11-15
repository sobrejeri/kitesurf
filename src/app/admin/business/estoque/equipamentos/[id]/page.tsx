import { notFound } from 'next/navigation';

import { Panel } from '@/components/admin/kit';
import { DemoBanner, PageHead } from '@/components/business/kit';
import { ConditionBadge, EquipmentBadge } from '@/components/business/stock-kit';
import { EmptyState } from '@/components/ui';
import { EQUIPMENT } from '@/lib/business/demo';
import { dayLabel, unitName } from '@/lib/business/rules';
import { equipmentHistory, equipmentStatus } from '@/lib/business/stock';

export const metadata = { title: 'Detalhes do equipamento' };

export default async function EquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = EQUIPMENT.find((x) => x.id === id);
  if (!e) notFound();
  const history = equipmentHistory(e.id);
  return (
    <>
      <DemoBanner />
      <PageHead title={`${e.code} · ${e.label}`} subtitle={unitName(e.unitId)} action={<EquipmentBadge status={equipmentStatus(e)} />} />
      <Panel title="Estado e histórico">
        <p className="mb-3 flex items-center gap-2 text-[13px] text-muted">Estado de conservação: <ConditionBadge condition={e.condition} /></p>
        {history.length === 0 ? <EmptyState>Sem aluguéis nem manutenções registrados.</EmptyState> : <ul className="divide-y divide-line text-[13px]">{history.map((h, i) => <li key={i} className="flex justify-between gap-3 py-2.5"><span className="text-ink">{h.text}</span><span className="tabular shrink-0 text-muted">{dayLabel(h.offset)}</span></li>)}</ul>}
      </Panel>
    </>
  );
}
