import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { CompanyPaymentList } from '@/components/company-payment-list';

export const metadata: Metadata = { title: 'Pagamentos externos da empresa' };
export default async function PaymentsPage({ params }: { params: Promise<{ companyId: string }> }) {
  await requireRole(['partner']);
  const { companyId } = await params;
  return <CompanyPaymentList companyId={companyId} area="afiliado"/>;
}
