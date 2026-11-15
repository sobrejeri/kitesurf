import { Panel } from '@/components/admin/kit';
import { DemoBanner, PageHead, Stat } from '@/components/business/kit';
import { StockTabs } from '@/components/business/stock-kit';
import { DataTable } from '@/components/business/kit';
import { EQUIPMENT, RENTALS } from '@/lib/business/demo';
import { dayLabel, parseScope, scopeQuery } from '@/lib/business/rules';
import { equipmentInScope, equipmentStatus } from '@/lib/business/stock';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Relatórios de estoque' };

export default async function StockReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseScope(await searchParams); const q = scopeQuery(scope);
  const ids = new Set(equipmentInScope(scope).map((e) => e.id));
  const done = RENTALS.filter((r) => ids.has(r.equipmentId));
  const revenue = done.reduce((t, r) => t + r.priceCents, 0);
  const file = (fmt: string) => `/admin/business/estoque/relatorios/arquivo?formato=${fmt}${q ? `&${q.slice(1)}` : ''}`;
  return (
    <>
      <DemoBanner />
      <PageHead title="Histórico e relatórios" subtitle="Aluguéis feitos e situação do estoque, nas unidades do filtro." />
      <StockTabs active="/admin/business/estoque/relatorios" query={q} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Aluguéis registrados" value={String(done.length)} /><Stat label="Valor dos aluguéis" value={formatMoney(revenue)} hint="Referência; pagamento é combinado no balcão" /><Stat label="Equipamentos" value={String(ids.size)} /><Stat label="Em manutenção" value={String(equipmentInScope(scope).filter((e) => equipmentStatus(e) === 'maintenance').length)} /></div>
      <Panel title="Histórico de aluguéis">
        <DataTable rows={[...done].sort((a, b) => b.dayOffset - a.dayOffset)} page={1} pageSize={10} hrefForPage={() => '#'} empty="Nenhum aluguel neste filtro."
          columns={[{ key: 'd', header: 'Data', cell: (r) => dayLabel(r.dayOffset), className: 'tabular' }, { key: 'e', header: 'Equipamento', cell: (r) => <span className="font-semibold">{EQUIPMENT.find((e) => e.id === r.equipmentId)?.code}</span> }, { key: 'c', header: 'Cliente', cell: (r) => r.customer }, { key: 'h', header: 'Horas', cell: (r) => String(r.hours), className: 'tabular' }, { key: 'v', header: 'Valor', cell: (r) => formatMoney(r.priceCents), className: 'tabular' }]} />
      </Panel>
      <div className="mt-4 flex flex-wrap gap-2"><a href={file('xlsx')} className="press inline-flex min-h-10 items-center rounded-full bg-brand px-4 text-[13px] font-semibold text-on-brand">Baixar Excel (.xlsx)</a><a href={file('pdf')} className="press inline-flex min-h-10 items-center rounded-full bg-brand px-4 text-[13px] font-semibold text-on-brand">Baixar PDF</a></div>
    </>
  );
}
