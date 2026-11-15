import { INSTRUCTOR_TABS, SectionTabs } from '@/components/business/company-kit';
import { InviteInstructorForm } from '@/components/business/instructor-forms';
import { DataTable, DemoBanner, PageHead } from '@/components/business/kit';
import { Badge } from '@/components/ui';
import { INVITATIONS } from '@/lib/business/demo';
import { INVITE_STATUS } from '@/lib/business/instructors';
import { dayLabel, unitName } from '@/lib/business/rules';
import { formatBps } from '@/lib/format';

export const metadata = { title: 'Convidar instrutor' };

export default function InviteInstructor() {
  return (
    <>
      <DemoBanner />
      <PageHead title="Convidar instrutor" subtitle="O instrutor aceita ou recusa pelo próprio app. Ele continua livre para atuar em outras escolas." />
      <SectionTabs label="Seções de instrutores" tabs={INSTRUCTOR_TABS} active="/admin/business/instrutores/convidar" />
      <InviteInstructorForm />
      <h2 className="mb-2 mt-6 text-[15px] font-semibold text-ink">Convites enviados</h2>
      <DataTable rows={INVITATIONS} page={1} pageSize={10} hrefForPage={() => '#'} empty="Nenhum convite."
        columns={[{ key: 'n', header: 'Instrutor', cell: (i) => <span className="font-semibold">{i.name}</span> }, { key: 'u', header: 'Unidades', cell: (i) => i.unitIds.map(unitName).join(', ') }, { key: 'c', header: 'Comissão', cell: (i) => formatBps(i.commissionBps), className: 'tabular' },
          { key: 'd', header: 'Enviado', cell: (i) => dayLabel(i.createdOffset), className: 'tabular' }, { key: 's', header: 'Situação', cell: (i) => <Badge tone={i.status === 'accepted' ? 'success' : i.status === 'pending' ? 'warning' : 'quiet'}>{INVITE_STATUS[i.status]}</Badge> }]} />
    </>
  );
}
