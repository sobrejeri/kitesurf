import { CouponForm } from '@/components/business/cart';
import { DataTable, DemoBanner, PageHead } from '@/components/business/kit';
import { ShopTabs } from '@/components/business/shop-kit';
import { Badge } from '@/components/ui';
import { COUPONS } from '@/lib/business/demo';
import { unitName } from '@/lib/business/rules';
import { couponLabel } from '@/lib/business/shop';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Cupons e promoções' };

export default function CouponsPage() {
  return (
    <>
      <DemoBanner />
      <PageHead title="Cupons e promoções" subtitle="O desconto é calculado no pedido e nunca passa do valor dos itens que o cupom cobre." />
      <ShopTabs active="/admin/business/lojinha/cupons" />
      <DataTable rows={COUPONS} page={1} pageSize={10} hrefForPage={() => '#'} empty="Nenhum cupom."
        columns={[{ key: 'c', header: 'Código', cell: (c) => <span className="font-semibold">{c.code}</span> }, { key: 'd', header: 'Desconto', cell: (c) => couponLabel(c), className: 'tabular' }, { key: 'm', header: 'Mínimo', cell: (c) => (c.minCents ? formatMoney(c.minCents) : '—'), className: 'tabular' },
          { key: 'u', header: 'Unidades', cell: (c) => (c.unitIds.length ? c.unitIds.map(unitName).join(', ') : 'Todas') }, { key: 'x', header: 'Usos', cell: (c) => `${c.used} de ${c.maxUses}`, className: 'tabular' },
          { key: 's', header: 'Situação', cell: (c) => (!c.active ? <Badge tone="quiet">Pausado</Badge> : c.untilOffset < 0 ? <Badge tone="danger">Vencido</Badge> : c.used >= c.maxUses ? <Badge tone="warning">Esgotado</Badge> : <Badge tone="success">Ativo</Badge>) }]} />
      <h2 className="mb-2 mt-6 text-[15px] font-semibold text-ink">Novo cupom</h2>
      <CouponForm />
    </>
  );
}
