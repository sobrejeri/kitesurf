import { notFound } from 'next/navigation';

import { DemoBanner, PageHead } from '@/components/business/kit';
import { PrintButton } from '@/components/business/print-button';
import { COMPANY, EXTERNAL_PAYMENTS, INSTRUCTORS } from '@/lib/business/demo';
import { METHOD_NAME } from '@/lib/business/finance';
import { dayLabel } from '@/lib/business/rules';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Comprovante de pagamento' };

export default async function PaymentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = EXTERNAL_PAYMENTS.find((x) => x.id === id);
  if (!p) notFound();
  return (
    <>
      <div className="print:hidden"><DemoBanner /><PageHead title="Comprovante de pagamento" subtitle="Registro do pagamento feito pela escola." action={<PrintButton />} /></div>
      <article aria-label={`Comprovante ${p.reference}`} className="mx-auto max-w-md rounded-[16px] border border-line bg-surface p-6 text-[13px] shadow-card print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[1.6px] text-muted">Comprovante de pagamento a instrutor</p>
        <h2 className="mt-1 text-center text-[18px] font-bold text-ink">{COMPANY.name}</h2>
        <dl className="mt-5 grid gap-2 border-t border-dashed border-line-ghost pt-4">
          {([['Referência', p.reference], ['Data', dayLabel(p.dayOffset)], ['Instrutor', INSTRUCTORS.find((i) => i.id === p.instructorId)?.name ?? ''], ['Forma', METHOD_NAME[p.method]], ['Valor', formatMoney(p.cents)], ['Confirmação do instrutor', p.confirmed ? 'Confirmado' : 'Aguardando']] as const)
            .map(([k, v]) => <div key={k} className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="text-right font-semibold text-ink">{v}</dd></div>)}
        </dl>
        <p className="mt-4 border-t border-dashed border-line-ghost pt-3 text-[12px] text-muted">Pagamento feito pela escola, fora do VentoKite. Este documento apenas registra o pagamento e não tem valor fiscal.</p>
      </article>
    </>
  );
}
