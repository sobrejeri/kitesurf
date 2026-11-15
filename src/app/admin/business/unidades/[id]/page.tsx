import { notFound } from 'next/navigation';

import { DemoBanner, PageHead } from '@/components/business/kit';
import { UnitForm } from '@/components/business/unit-form';
import { UNITS } from '@/lib/business/demo';

export const metadata = { title: 'Detalhes da unidade' };
export default async function UnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const unit = UNITS.find((u) => u.id === id);
  if (!unit) notFound();
  return (<><DemoBanner /><PageHead title={unit.name} subtitle={`${unit.city} · detalhes e configurações da unidade`} /><UnitForm unit={unit} /></>);
}
