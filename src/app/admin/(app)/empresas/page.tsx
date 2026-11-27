import type { Metadata } from 'next';
import { BusinessCompanyWorkspace } from '@/components/business/company-workspace';
import { requireRole } from '@/lib/auth';
export const metadata:Metadata={title:'Empresas'};
export default async function CompaniesPage() {
  await requireRole(['admin'],'/admin/empresas');
  return <BusinessCompanyWorkspace area="admin"/>;
}
