import type { AppArea } from '@/lib/app-areas';
import { Card, Note } from '@/components/ui';
import { PaymentReceiptDownload } from '@/components/payment-receipt-download';
import { readCompanyPayments } from '@/lib/company-payment-data';
import { businessReceiptsEnabled } from '@/lib/business/payment-receipt-feature';
import { formatMoney } from '@/lib/format';

export async function CompanyPaymentList({ companyId, area }: { companyId: string; area: AppArea }) {
  const result = await readCompanyPayments(companyId);
  if (result.kind === 'disabled') return <Note>Os pagamentos da empresa ainda não estão disponíveis.</Note>;
  if (result.kind === 'denied') return <Note tone="warning">Sua conta não tem acesso financeiro a esta empresa.</Note>;
  if (result.kind !== 'ready') return <Note tone="warning">Não foi possível consultar os pagamentos. Tente novamente mais tarde.</Note>;
  const statuses = { voided: 'Anulado', confirmed: 'Recebimento confirmado', pending: 'Aguardando confirmação do instrutor' };
  const methods: Record<string, string> = { pix: 'Pix', ted: 'Transferência', cash: 'Dinheiro' };
  return <div className="grid gap-4"><header><h1 className="text-2xl font-bold">Pagamentos externos · {result.companyName}</h1><p className="mt-2 text-sm text-muted">Pagamentos feitos pela escola fora do VentoKite. Esta tela apenas consulta os registros.</p></header>
    {!result.payments.length ? <Note>Nenhum pagamento registrado.</Note> : result.payments.map(payment => <Card key={payment.id}>
      <div className="flex flex-wrap justify-between gap-2"><strong>{formatMoney(payment.cents)}</strong><span>{statuses[payment.status]}</span></div>
      <p className="mt-2 break-words text-sm">{payment.reference} · {payment.paidOn.split('-').reverse().join('/')} · {methods[payment.method] ?? 'Outro'}</p>
      {result.canDownloadReceipts && businessReceiptsEnabled() ? <div className="mt-2"><PaymentReceiptDownload paymentId={payment.id} area={area} /><p className="text-xs text-muted">Disponível após o envio do arquivo pela escola.</p></div> : null}
    </Card>)}
    {result.hasMore ? <Note>Exibindo os 100 pagamentos mais recentes.</Note> : null}
  </div>;
}
