import Link from 'next/link';

import { DataTable, DemoBanner, PageHead } from '@/components/business/kit';
import { ConditionBadge, EquipmentBadge, StockTabs } from '@/components/business/stock-kit';
import { ButtonLink } from '@/components/ui';
import { parseScope, scopeQuery, unitName } from '@/lib/business/rules';
import { HOURLY_CENTS, TYPE_LABEL, equipmentInScope, equipmentStatus } from '@/lib/business/stock';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Equipamentos' };

export default async function EquipmentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseScope(await searchParams); const q = scopeQuery(scope);
  return (
    <>
      <DemoBanner />
      <PageHead title="Equipamentos" subtitle="Cada equipamento tem código, estado e histórico próprios." action={<ButtonLink href={`/admin/business/estoque/equipamentos/novo${q}`} size="sm" icon="plus">Novo equipamento</ButtonLink>} />
      <StockTabs active="/admin/business/estoque/equipamentos" query={q} />
      <DataTable rows={equipmentInScope(scope)} page={1} pageSize={12} hrefForPage={() => '#'} empty="Nenhum equipamento neste filtro."
        columns={[{ key: 'c', header: 'Código', cell: (e) => <Link href={`/admin/business/estoque/equipamentos/${e.id}${q}`} className="font-mono font-semibold text-brand hover:underline">{e.code}</Link> }, { key: 'n', header: 'Equipamento', cell: (e) => e.label },
          { key: 'u', header: 'Unidade', cell: (e) => unitName(e.unitId) }, { key: 'h', header: 'Aluguel/hora', cell: (e) => formatMoney(HOURLY_CENTS[e.type]), className: 'tabular' }, { key: 'o', header: 'Estado', cell: (e) => <ConditionBadge condition={e.condition} /> }, { key: 's', header: 'Situação', cell: (e) => <EquipmentBadge status={equipmentStatus(e)} /> }, { key: 't', header: 'Tipo', cell: (e) => TYPE_LABEL[e.type] }]} />
    </>
  );
}
