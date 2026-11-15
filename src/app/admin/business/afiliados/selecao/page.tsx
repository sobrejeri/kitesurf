import { AffiliateTabs } from '@/components/business/affiliate-kit';
import { DataTable, DemoBanner, PageHead } from '@/components/business/kit';
import { COMPANY_AFFILIATES } from '@/lib/business/demo';
import { OFFERS, bpsLabel, currentRate, offerKind, offerName, promotersOf, selectionOf } from '@/lib/business/affiliates';

export const metadata = { title: 'Produtos e serviços para divulgação' };

export default function SelectionPage() {
  const rows = OFFERS.map((id) => ({ id }));
  return (
    <>
      <DemoBanner />
      <PageHead title="Divulgação" subtitle="Cada afiliado escolhe lojinhas, produtos e serviços para divulgar. Aqui você vê quem divulga o quê e a comissão vigente." />
      <AffiliateTabs active="/admin/business/afiliados/selecao" />
      <DataTable rows={rows} page={1} pageSize={20} hrefForPage={() => '#'} empty="Nada para divulgar."
        columns={[{ key: 'n', header: 'Item', cell: (r) => <span className="font-semibold">{offerName(r.id)}</span> }, { key: 'k', header: 'Tipo', cell: (r) => offerKind(r.id) }, { key: 'c', header: 'Comissão vigente', cell: (r) => bpsLabel(currentRate(r.id)), className: 'tabular' },
          { key: 'p', header: 'Quem divulga', cell: (r) => (promotersOf(r.id) ? `${promotersOf(r.id)}: ${COMPANY_AFFILIATES.filter((a) => selectionOf(a.id).includes(r.id)).map((a) => a.name).join(', ')}` : 'Ninguém ainda') }]} />
    </>
  );
}
