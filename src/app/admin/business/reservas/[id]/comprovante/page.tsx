import { notFound } from 'next/navigation';

import { PrintButton } from '@/components/business/print-button';
import { DemoBanner, PageHead } from '@/components/business/kit';
import { COMPANY } from '@/lib/business/demo';
import { bookingEnd, externalById } from '@/lib/business/bookings';
import { dayLabel, instructorName, unitName } from '@/lib/business/rules';
import { serviceOf } from '@/lib/business/services';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Comprovante da reserva' };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = externalById(id);
  if (!b) notFound();
  return (
    <>
      <div className="print:hidden"><DemoBanner /><PageHead title="Comprovante" subtitle="Confira e imprima." action={<PrintButton />} /></div>
      <article aria-label={`Comprovante da reserva ${b.code}`} className="mx-auto max-w-md rounded-[16px] border border-line bg-surface p-6 text-[13px] shadow-card print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[1.6px] text-muted">Comprovante de reserva</p>
        <h2 className="mt-1 text-center text-[18px] font-bold text-ink">{COMPANY.name}</h2>
        <p className="mt-0.5 text-center text-muted">{unitName(b.unitId)}</p>
        <dl className="mt-5 grid gap-2 border-t border-dashed border-line-ghost pt-4">
          {([['Reserva', b.code], ['Serviço', serviceOf(b.serviceId)?.name ?? ''], ['Quando', `${dayLabel(b.dayOffset)}, ${b.start}–${bookingEnd(b)}`], ['Instrutor', instructorName(b.instructorId)], ['Cliente', b.customer], ['Valor', formatMoney(b.priceCents)]] as const)
            .map(([k, v]) => <div key={k} className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="text-right font-semibold text-ink">{v}</dd></div>)}
        </dl>
        <p className="mt-4 border-t border-dashed border-line-ghost pt-3 text-[12px] text-muted">Origem: reserva presencial. O pagamento é combinado no balcão e não é confirmado por este comprovante.</p>
      </article>
    </>
  );
}
