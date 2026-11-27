import type { Metadata } from 'next';
import { BusinessCompanyWorkspace } from '@/components/business/company-workspace';
import { requireRole } from '@/lib/auth';
export const metadata:Metadata={title:'Empresas'};
export default async function CompanyPage() {
  await requireRole(['partner'],'/afiliado/empresa');
  return <BusinessCompanyWorkspace area="afiliado"/>;
}
