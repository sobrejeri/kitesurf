import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminTitle, Panel } from '@/components/admin/kit';
import { ActionForm } from '@/components/action-form';
import { EmptyState, Note } from '@/components/ui';
import { PaymentReceiptDownload } from '@/components/payment-receipt-download';
import { confirmCompanyPayment } from '@/app/actions/instructor-company-payments';
import { requireRole } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { businessReceiptsEnabled } from '@/lib/business/payment-receipt-feature';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Recebimentos de escolas' };

export default async function CompanyPaymentsPage() {
  const viewer = await requireRole(['instructor'], '/instrutor/financeiro/recebimentos');
  if (viewer.role !== 'instructor') return <Note>Esta área é destinada ao próprio instrutor.</Note>;
  if (process.env.NEXT_PUBLIC_VENTO_BUSINESS_PAYMENTS_ENABLED !== 'true') {
    return <><AdminTitle title="Recebimentos de escolas" subtitle="Acompanhe os pagamentos feitos pelas escolas fora do VentoKite." /><Note className="mt-4">Os recebimentos de escolas ainda não estão disponíveis.</Note><Link href="/instrutor/financeiro" className="mt-4 inline-block text-brand underline">Voltar ao financeiro</Link></>;
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('company_instructor_payments')
    .select('id,instructor_id,company_id,link_id,cents,method,reference,paid_on,confirmed_at,voided_at')
    .eq('instructor_id', viewer.id).order('paid_on', { ascending: false }).limit(100);
  const { data: earnings, error: earningsError } = await supabase.rpc('my_company_earnings');
  const names = new Map<string, { companyId: string; name: string }>();
  for (const item of earnings ?? []) if (typeof item.link_id === 'string' && typeof item.company_id === 'string' && typeof item.company_name === 'string' && item.company_name.trim()) names.set(item.link_id, { companyId: item.company_id, name: item.company_name });
  const invalidOwner = data?.some((payment) => payment.instructor_id !== viewer.id) ?? false;
  const invalidCompany = data?.some((payment) => names.get(payment.link_id)?.companyId !== payment.company_id) ?? false;
  const safeData = invalidOwner || invalidCompany ? [] : data ?? [];
  const methods: Record<string, string> = { pix: 'Pix', ted: 'Transferência', cash: 'Dinheiro' };
  return <>
    <AdminTitle title="Recebimentos de escolas" subtitle="Confira os pagamentos que você recebeu diretamente das escolas." />
    <Note className="mt-4">Confirme somente quando o dinheiro tiver chegado a você. O VentoKite não faz essa transferência.</Note>
    <Panel title="Registros de recebimento" className="mt-4">
      {error || earningsError || invalidOwner || invalidCompany ? <Note tone="warning">Não foi possível carregar os recebimentos. Tente novamente mais tarde.</Note> : !safeData.length ? <EmptyState>Nenhum recebimento registrado para você.</EmptyState> : <ul className="grid gap-3">{safeData.map((p) => <li key={p.id} className="rounded-[14px] border border-line p-4">
        <div className="flex flex-wrap justify-between gap-2"><strong>{formatMoney(p.cents)}</strong><span>{p.voided_at ? 'Cancelado' : p.confirmed_at ? 'Confirmado' : 'Aguardando sua confirmação'}</span></div>
        <p className="mt-1 font-semibold">{names.get(p.link_id)?.name}</p>
        <p className="mt-1 text-sm text-muted">{methods[p.method] ?? 'Outro'} · {p.paid_on.split('-').reverse().join('/')} · Referência: {p.reference}</p>
        {businessReceiptsEnabled() ? <div className="mt-2"><PaymentReceiptDownload paymentId={p.id} area="instrutor" /><p className="mt-1 text-xs text-muted">Disponível após o envio do arquivo pela escola.</p></div> : null}
        {!p.confirmed_at && !p.voided_at ? <ActionForm action={confirmCompanyPayment} submitLabel="Confirmar recebimento" className="mt-3 grid gap-2">
          <input type="hidden" name="paymentId" value={p.id} />
          <label className="text-sm"><input type="checkbox" name="acknowledge" value="yes" required /> Confirmo que recebi este valor da escola.</label>
        </ActionForm> : null}
      </li>)}</ul>}
      {data?.length === 100 ? <p className="mt-3 text-sm text-muted">Exibindo os 100 registros mais recentes.</p> : null}
    </Panel>
    <Link href="/instrutor/financeiro" className="mt-4 inline-block text-brand underline">Voltar ao financeiro</Link>
  </>;
}
