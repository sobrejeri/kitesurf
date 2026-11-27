import type { Metadata } from 'next';
import { BusinessCompanyWorkspace } from '@/components/business/company-workspace';
import { requireRole } from '@/lib/auth';
export const metadata:Metadata={title:'Empresas'};
export default async function CompanyPage() {
  await requireRole(['student'],'/aluno/empresa');
  return <BusinessCompanyWorkspace area="aluno"/>;
}
