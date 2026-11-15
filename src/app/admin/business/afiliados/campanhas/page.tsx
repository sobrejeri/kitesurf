import { AffiliateTabs } from '@/components/business/affiliate-kit';
import { CampaignForm } from '@/components/business/affiliate-forms';
import { DataTable, DemoBanner, PageHead } from '@/components/business/kit';
import { Badge } from '@/components/ui';
import { CAMPAIGNS } from '@/lib/business/demo';
import { offerName } from '@/lib/business/affiliates';
import { dayLabel } from '@/lib/business/rules';

export const metadata = { title: 'Campanhas disponíveis' };

export default function CampaignsPage() {
  return (
    <>
      <DemoBanner />
      <PageHead title="Campanhas disponíveis" subtitle="Conjuntos de itens que a escola pede para os afiliados divulgarem." />
      <AffiliateTabs active="/admin/business/afiliados/campanhas" />
      <DataTable rows={CAMPAIGNS} page={1} pageSize={10} hrefForPage={() => '#'} empty="Nenhuma campanha."
        columns={[{ key: 'n', header: 'Campanha', cell: (c) => <span className="font-semibold">{c.name}</span> }, { key: 'i', header: 'Itens', cell: (c) => c.refIds.map(offerName).join(', ') }, { key: 'v', header: 'Até', cell: (c) => dayLabel(c.untilOffset), className: 'tabular' },
          { key: 's', header: 'Situação', cell: (c) => (!c.active || c.untilOffset < 0 ? <Badge tone="quiet">Encerrada</Badge> : <Badge tone="success">No ar</Badge>) }]} />
      <h2 className="mb-2 mt-6 text-[15px] font-semibold text-ink">Nova campanha</h2>
      <CampaignForm />
    </>
  );
}
