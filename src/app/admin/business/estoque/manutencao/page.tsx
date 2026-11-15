import { DataTable, DemoBanner, PageHead } from '@/components/business/kit';
import { StockTabs } from '@/components/business/stock-kit';
import { MaintenanceForm } from '@/components/business/stock-forms';
import { Badge } from '@/components/ui';
import { EQUIPMENT, MAINTENANCE } from '@/lib/business/demo';
import { dayLabel, parseScope, scopeQuery } from '@/lib/business/rules';
import { equipmentInScope } from '@/lib/business/stock';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Manutenção de equipamentos' };

export default async function MaintenancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseScope(await searchParams); const ids = new Set(equipmentInScope(scope).map((e) => e.id));
  const rows = MAINTENANCE.filter((m) => ids.has(m.equipmentId));
  return (
    <>
      <DemoBanner />
      <PageHead title="Manutenção" subtitle="Equipamento com manutenção aberta não pode ser alugado." />
      <StockTabs active="/admin/business/estoque/manutencao" query={scopeQuery(scope)} />
      <DataTable rows={rows} page={1} pageSize={10} hrefForPage={() => '#'} empty="Nenhuma manutenção neste filtro."
        columns={[{ key: 'e', header: 'Equipamento', cell: (m) => <span className="font-semibold">{EQUIPMENT.find((e) => e.id === m.equipmentId)?.code}</span> }, { key: 'd', header: 'Aberta em', cell: (m) => dayLabel(m.openedOffset), className: 'tabular' }, { key: 'p', header: 'Problema', cell: (m) => m.description },
          { key: 'c', header: 'Custo', cell: (m) => (m.costCents === null ? '—' : formatMoney(m.costCents)), className: 'tabular' }, { key: 's', header: 'Situação', cell: (m) => <Badge tone={m.status === 'open' ? 'warning' : 'success'}>{m.status === 'open' ? 'Aberta' : 'Concluída'}</Badge> }]} />
      <h2 className="mb-2 mt-6 text-[15px] font-semibold text-ink">Abrir manutenção</h2>
      <MaintenanceForm />
    </>
  );
}
