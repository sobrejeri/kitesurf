import type { AppArea } from '@/lib/app-areas';

/** Use only for a real payment visible to the currently authenticated user. */
export function PaymentReceiptDownload({ paymentId, area }: { paymentId: string; area: AppArea }) {
  return <a className="text-sm font-semibold text-brand underline" href={`/api/business/payment-receipt?area=${encodeURIComponent(area)}&paymentId=${encodeURIComponent(paymentId)}`}>Baixar comprovante</a>;
}
