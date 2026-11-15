import { CompanyRegisterForm } from '@/components/business/company-forms';
import { COMPANY_TABS, SectionTabs } from '@/components/business/company-kit';
import { DemoBanner, PageHead } from '@/components/business/kit';

export const metadata = { title: 'Cadastro de empresa' };

export default function CompanyRegister() {
  return (
    <>
      <DemoBanner />
      <PageHead title="Cadastro de empresa" subtitle="Cadastre uma escola, pousada ou operadora. O responsável vira Proprietário." />
      <SectionTabs label="Seções da empresa" tabs={COMPANY_TABS} active="/admin/business/empresa/cadastro" />
      <CompanyRegisterForm />
    </>
  );
}
