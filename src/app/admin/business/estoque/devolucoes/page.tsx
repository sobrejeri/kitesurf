import { DataTable, DemoBanner, PageHead } from '@/components/business/kit';
import { ConditionBadge, StockTabs } from '@/components/business/stock-kit';
import { ReturnForm } from '@/components/business/stock-forms';
import { EQUIPMENT, RENTALS } from '@/lib/business/demo';
import { dayLabel, parseScope, scopeQuery } from '@/lib/business/rules';
import { equipmentInScope } from '@/lib/business/stock';

export const metadata = { title: 'Devoluções' };

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseScope(await searchParams); const ids = new Set(equipmentInScope(scope).map((e) => e.id));
  const rows = RENTALS.flatMap((r) => (r.returned && ids.has(r.equipmentId) ? [{ id: r.id, r, back: r.returned }] : []));
  return (
    <>
      <DemoBanner />
      <PageHead title="Devoluções" subtitle="Ao devolver, informe o estado. Se voltou em estado ruim, o equipamento vai para a manutenção." />
      <StockTabs active="/admin/business/estoque/devolucoes" query={scopeQuery(scope)} />
      <ReturnForm />
      <h2 className="mb-2 mt-6 text-[15px] font-semibold text-ink">Devolvidos</h2>
      <DataTable rows={rows} page={1} pageSize={10} hrefForPage={() => '#'} empty="Nenhuma devolução neste filtro."
        columns={[{ key: 'e', header: 'Equipamento', cell: (x) => <span className="font-semibold">{EQUIPMENT.find((e) => e.id === x.r.equipmentId)?.code}</span> }, { key: 'c', header: 'Cliente', cell: (x) => x.r.customer }, { key: 'd', header: 'Devolvido', cell: (x) => dayLabel(x.back.dayOffset), className: 'tabular' },
          { key: 's', header: 'Saiu', cell: (x) => <ConditionBadge condition={x.r.conditionOut} /> }, { key: 'v', header: 'Voltou', cell: (x) => <ConditionBadge condition={x.back.condition} /> }, { key: 'n', header: 'Observação', cell: (x) => x.back.note || '—' }]} />
    </>
  );
}
