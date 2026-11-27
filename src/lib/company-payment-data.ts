import 'server-only';
import { getViewer } from '@/lib/auth';
import { readCompanyWorkspace } from '@/lib/business/core-data';
import { businessCoreEnabled } from '@/lib/business/core-feature';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type PaymentRow = { id: string; company_id: string; cents: number; method: string; reference: string; paid_on: string; confirmed_at: string | null; voided_at: string | null };
export type CompanyPaymentResult = { kind: 'disabled' | 'denied' | 'unavailable' } | {
  kind: 'ready'; companyName: string; hasMore: boolean; canDownloadReceipts: boolean;
  payments: { id: string; cents: number; method: string; reference: string; paidOn: string; status: 'voided' | 'confirmed' | 'pending' }[];
};

/** Read-only company finance. Membership alone never implies finance access. */
export async function readCompanyPayments(companyId: string): Promise<CompanyPaymentResult> {
  if (!businessCoreEnabled() || process.env.NEXT_PUBLIC_VENTO_BUSINESS_PAYMENTS_ENABLED !== 'true') return { kind: 'disabled' };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(companyId)) return { kind: 'denied' };
  try {
    const viewer = await getViewer();
    if (!viewer || (viewer.role === 'admin' && !viewer.secondFactor)) return { kind: 'denied' };
    const workspace = await readCompanyWorkspace();
    if (workspace.kind !== 'ready') return { kind: workspace.kind === 'unavailable' ? 'unavailable' : 'denied' };
    const company = workspace.companies.find(item => item.id === companyId);
    if (!company) return { kind: 'denied' };
    const db = await createSupabaseServerClient();
    const permission = await db.rpc('company_any_permission', { p_company: companyId, p_permission: 'finance.reports' });
    if (permission.error) return { kind: 'unavailable' };
    if (viewer.role !== 'admin' && permission.data !== true) return { kind: 'denied' };
    const result = await db.from('company_instructor_payments')
      .select('id,company_id,cents,method,reference,paid_on,confirmed_at,voided_at')
      .eq('company_id', companyId).order('paid_on', { ascending: false }).order('id').limit(101).returns<PaymentRow[]>();
    if (result.error) return { kind: 'unavailable' };
    const rows = result.data ?? [];
    if (rows.some(row => row.company_id !== companyId || !Number.isSafeInteger(row.cents) || row.cents < 1)) return { kind: 'unavailable' };
    return { kind: 'ready', companyName: company.name, hasMore: rows.length > 100, canDownloadReceipts: permission.data === true, payments: rows.slice(0, 100).map(row => ({
      id: row.id, cents: row.cents, method: row.method, reference: row.reference, paidOn: row.paid_on,
      status: row.voided_at ? 'voided' : row.confirmed_at ? 'confirmed' : 'pending',
    })) };
  } catch { return { kind: 'unavailable' }; }
}
