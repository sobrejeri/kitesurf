import { notFound } from 'next/navigation';

import { Panel } from '@/components/admin/kit';
import { DemoBanner, PageHead } from '@/components/business/kit';
import { OrderBadge } from '@/components/business/shop-kit';
import { Note } from '@/components/ui';
import { ORIGIN_LABEL, type CartItem } from '@/lib/business/demo';
import { dayLabel, instructorName, unitName } from '@/lib/business/rules';
import { itemTitle, lineCents, orderById, orderTotals } from '@/lib/business/shop';
import { TYPE_LABEL } from '@/lib/business/stock';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Detalhes do pedido' };
const detail = (i: CartItem) => (i.kind === 'lesson' ? `${dayLabel(i.dayOffset)}, ${i.start} · ${instructorName(i.instructorId)} · ${i.people} aluno(s)` : i.kind === 'product' ? `${i.qty} un.` : `${i.qty} × ${TYPE_LABEL[i.type]} · ${i.hours} h`);

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const o = orderById((await params).id); if (!o) notFound();
  const t = orderTotals(o);
  return (
    <>
      <DemoBanner />
      <PageHead title={`Pedido ${o.number}`} subtitle={`${o.customer} · ${o.phone} · ${ORIGIN_LABEL[o.origin]} · ${dayLabel(o.createdOffset)}`} action={<OrderBadge status={o.status} />} />
      <Note tone="warning" title="Pagamento não confirmado" className="mb-4">O VentoKite não recebe nem confirma este pagamento. A escola combina e recebe diretamente com o cliente.</Note>
      <div className="grid gap-4">
        {t.units.map((u) => (
          <Panel key={u.unitId} title={`Pedido operacional · ${unitName(u.unitId)}`}>
            <ul className="divide-y divide-line text-[13px]">{u.items.map((i) => <li key={i.id} className="flex items-start justify-between gap-3 py-2.5"><span><strong className="text-ink">{itemTitle(i)}</strong><br /><span className="text-muted">{detail(i)}</span></span><span className="tabular shrink-0 font-semibold text-ink">{formatMoney(lineCents(i))}</span></li>)}</ul>
            <p className="tabular mt-2 flex justify-between border-t border-line pt-2 text-[13px] text-muted"><span>{u.discountCents ? `Cupom ${o.couponCode}: − ${formatMoney(u.discountCents)}` : 'Sem desconto'}</span><span className="font-semibold text-ink">{formatMoney(u.totalCents)}</span></p>
          </Panel>))}
        <p className="tabular text-right text-[16px] font-bold text-ink">Total do pedido: {formatMoney(t.totalCents)}</p>
      </div>
    </>
  );
}
