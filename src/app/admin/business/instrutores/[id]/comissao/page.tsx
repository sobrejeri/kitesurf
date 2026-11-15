import { notFound } from 'next/navigation';

import { INSTRUCTOR_TABS, SectionTabs } from '@/components/business/company-kit';
import { InstructorRateForm } from '@/components/business/instructor-forms';
import { DataTable, DemoBanner, PageHead } from '@/components/business/kit';
import { Badge } from '@/components/ui';
import { dayLabel, unitName } from '@/lib/business/rules';
import { instructorRateAt, linkOf, rateVersionsOf } from '@/lib/business/instructors';
import { formatBps } from '@/lib/format';

export const metadata = { title: 'Comissão individual' };

export default async function InstructorRate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const i = linkOf(id); if (!i) notFound();
  const rows = [...rateVersionsOf(i.id)].sort((a, b) => b.fromOffset - a.fromOffset);
  const current = (v: (typeof rows)[number]) => instructorRateAt(i.id, v.unitId === 'all' ? '' : v.unitId, 0) === v.bps && !rows.some((o) => o.unitId === v.unitId && o.fromOffset > v.fromOffset && o.fromOffset <= 0);
  return (
    <>
      <DemoBanner />
      <PageHead title={`Comissão de ${i.name}`} subtitle="Cada mudança é uma nova versão, sem efeito retroativo. A comissão é congelada em cada aula." />
      <SectionTabs label="Seções de instrutores" tabs={INSTRUCTOR_TABS} active="/admin/business/instrutores" />
      <DataTable rows={rows} page={1} pageSize={10} hrefForPage={() => '#'} empty="Sem versões."
        columns={[{ key: 'u', header: 'Vale para', cell: (v) => <span className="font-semibold">{v.unitId === 'all' ? 'Todas as unidades' : unitName(v.unitId)}</span> }, { key: 'p', header: 'Comissão', cell: (v) => formatBps(v.bps), className: 'tabular' }, { key: 'd', header: 'Vale desde', cell: (v) => dayLabel(v.fromOffset), className: 'tabular' },
          { key: 's', header: 'Situação', cell: (v) => (current(v) ? <Badge tone="success">Vigente</Badge> : <Badge tone="quiet">Substituída</Badge>) }]} />
      <h2 className="mb-2 mt-6 text-[15px] font-semibold text-ink">Alterar comissão</h2>
      <InstructorRateForm instructorId={i.id} />
    </>
  );
}
