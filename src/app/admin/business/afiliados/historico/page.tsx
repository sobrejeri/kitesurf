import { AffiliateTabs, CommissionBadge, PaymentNotice } from '@/components/business/affiliate-kit';
import { DataTable, DemoBanner, PageHead } from '@/components/business/kit';
import { AFFILIATE_SALES } from '@/lib/business/demo';
import { affiliateOf, bpsLabel, commissionCents, commissionState, offerName, rateAt } from '@/lib/business/affiliates';
import { dayLabel } from '@/lib/business/rules';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Histórico de comissões' };

export default function CommissionHistory() {
  const rows = [...AFFILIATE_SALES].sort((a, b) => b.dayOffset - a.dayOffset);
  return (
    <>
      <DemoBanner />
      <PageHead title="Histórico de comissões" subtitle="Cada comissão com o percentual congelado no dia da venda. Cancelamentos e estornos já estão descontados." />
      <AffiliateTabs active="/admin/business/afiliados/historico" />
      <PaymentNotice />
      <DataTable rows={rows} page={1} pageSize={10} hrefForPage={() => '#'} empty="Nenhuma comissão."
        columns={[{ key: 'd', header: 'Data', cell: (s) => dayLabel(s.dayOffset), className: 'tabular' }, { key: 'a', header: 'Afiliado', cell: (s) => <span className="font-semibold">{affiliateOf(s.affiliateId)?.name}</span> },
          { key: 'i', header: 'Item', cell: (s) => `${offerName(s.refId)} · ${s.order}` }, { key: 'p', header: 'Percentual', cell: (s) => bpsLabel(rateAt(s.refId, s.dayOffset)), className: 'tabular' },
          { key: 'e', header: 'Estorno', cell: (s) => (s.refundedCents ? formatMoney(s.refundedCents) : '—'), className: 'tabular' }, { key: 'c', header: 'Comissão', cell: (s) => formatMoney(commissionCents(s)), className: 'tabular' }, { key: 's', header: 'Situação', cell: (s) => <CommissionBadge state={commissionState(s)} /> }]} />
    </>
  );
}
