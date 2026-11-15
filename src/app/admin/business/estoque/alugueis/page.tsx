import { DataTable, DemoBanner, PageHead } from '@/components/business/kit';
import { RentalBadge, StockTabs } from '@/components/business/stock-kit';
import { RentalForm } from '@/components/business/stock-forms';
import { currentContext } from '@/lib/business/bookings';
import { EQUIPMENT, RENTALS } from '@/lib/business/demo';
import { dayLabel, parseScope, scopeQuery, unitName } from '@/lib/business/rules';
import { equipmentInScope, rentalState } from '@/lib/business/stock';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Aluguéis ativos' };

export default async function RentalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseScope(await searchParams);
  const now = currentContext().nowMinutes; const ids = new Set(equipmentInScope(scope).map((e) => e.id));
  const rows = RENTALS.filter((r) => !r.returned && ids.has(r.equipmentId));
  const eq = (id: string) => EQUIPMENT.find((e) => e.id === id);
  return (
    <>
      <DemoBanner />
      <PageHead title="Aluguéis ativos" subtitle="Equipamentos que estão com clientes agora." />
      <StockTabs active="/admin/business/estoque/alugueis" query={scopeQuery(scope)} />
      <DataTable rows={rows} page={1} pageSize={10} hrefForPage={() => '#'} empty="Nenhum aluguel em andamento neste filtro."
        columns={[{ key: 'e', header: 'Equipamento', cell: (r) => <span className="font-semibold">{eq(r.equipmentId)?.code} · {eq(r.equipmentId)?.label}</span> }, { key: 'c', header: 'Cliente', cell: (r) => r.customer }, { key: 'u', header: 'Unidade', cell: (r) => unitName(eq(r.equipmentId)?.unitId ?? '') },
          { key: 's', header: 'Saída', cell: (r) => `${dayLabel(r.dayOffset)}, ${r.start} · ${r.hours} h`, className: 'tabular' }, { key: 'v', header: 'Valor', cell: (r) => formatMoney(r.priceCents), className: 'tabular' }, { key: 't', header: 'Situação', cell: (r) => <RentalBadge state={rentalState(r, now)} /> }]} />
      <h2 className="mb-2 mt-6 text-[15px] font-semibold text-ink">Novo aluguel</h2>
      <RentalForm />
    </>
  );
}
