import { InviteForm } from '@/components/business/company-forms';
import { STAFF_TABS, SectionTabs } from '@/components/business/company-kit';
import { DemoBanner, PageHead } from '@/components/business/kit';

export const metadata = { title: 'Convidar funcionário' };

export default function InviteStaff() {
  return (
    <>
      <DemoBanner />
      <PageHead title="Convidar funcionário" subtitle="Escolha um cargo por unidade. O cargo de Proprietário não é concedido por convite." />
      <SectionTabs label="Seções da equipe" tabs={STAFF_TABS} active="/admin/business/funcionarios/convidar" />
      <InviteForm />
    </>
  );
}
