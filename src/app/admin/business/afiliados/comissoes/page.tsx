import { AffiliateTabs } from '@/components/business/affiliate-kit';
import { RateForm } from '@/components/business/affiliate-forms';
import { DataTable, DemoBanner, PageHead } from '@/components/business/kit';
import { Badge } from '@/components/ui';
import { RATE_VERSIONS } from '@/lib/business/demo';
import { bpsLabel, offerName } from '@/lib/business/affiliates';
import { dayLabel } from '@/lib/business/rules';

export const metadata = { title: 'Configuração de comissões' };

export default function RatesPage() {
  const rows = [...RATE_VERSIONS].sort((a, b) => (a.scope === b.scope ? b.fromOffset - a.fromOffset : a.scope.localeCompare(b.scope)));
  const current = (v: (typeof rows)[number]) => !RATE_VERSIONS.some((o) => o.scope === v.scope && o.fromOffset > v.fromOffset && o.fromOffset <= 0);
  return (
    <>
      <DemoBanner />
      <PageHead title="Configuração de comissões" subtitle="Percentual padrão e percentuais próprios por item. Cada mudança é uma nova versão, sem efeito retroativo." />
      <AffiliateTabs active="/admin/business/afiliados/comissoes" />
      <DataTable rows={rows} page={1} pageSize={20} hrefForPage={() => '#'} empty="Nenhum percentual."
        columns={[{ key: 'e', header: 'Item', cell: (v) => <span className="font-semibold">{v.scope === 'default' ? 'Padrão' : offerName(v.scope)}</span> }, { key: 'p', header: 'Percentual', cell: (v) => bpsLabel(v.bps), className: 'tabular' }, { key: 'd', header: 'Vale desde', cell: (v) => dayLabel(v.fromOffset), className: 'tabular' },
          { key: 's', header: 'Situação', cell: (v) => (current(v) ? <Badge tone="success">Vigente</Badge> : <Badge tone="quiet">Substituído</Badge>) }]} />
      <h2 className="mb-2 mt-6 text-[15px] font-semibold text-ink">Alterar percentual</h2>
      <RateForm />
    </>
  );
}
