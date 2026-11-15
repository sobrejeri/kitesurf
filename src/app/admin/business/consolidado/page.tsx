import Link from 'next/link';

import { COMPANY_TABS, SectionTabs } from '@/components/business/company-kit';
import { DataTable, DemoBanner, PageHead, Stat } from '@/components/business/kit';
import { Note } from '@/components/ui';
import { EMPLOYEES } from '@/lib/business/demo';
import { consolidatedRows, employeeById, isOwner, roleLabel, unitsVisibleTo } from '@/lib/business/company';
import { UNITS } from '@/lib/business/demo';

export const metadata = { title: 'Visão consolidada' };

export default async function Consolidated({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const as = typeof params.como === 'string' ? employeeById(params.como) : undefined;
  const viewer = as ?? employeeById('f-1'); const units = as ? unitsVisibleTo(as) : UNITS;
  const rows = consolidatedRows(units); const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((n, r) => n + f(r), 0);
  const chip = (id: string, label: string, on: boolean) => <Link key={id} href={id ? `/admin/business/consolidado?como=${id}` : '/admin/business/consolidado'} aria-current={on ? 'page' : undefined} className={`press inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold ${on ? 'border-brand bg-brand text-on-brand' : 'border-line-ghost text-ink hover:bg-brand-wash'}`}>{label}</Link>;
  return (
    <>
      <DemoBanner />
      <PageHead title="Visão consolidada" subtitle="Todas as unidades lado a lado. Cada funcionário só vê as unidades em que está vinculado." />
      <SectionTabs label="Seções da empresa" tabs={COMPANY_TABS} active="/admin/business/consolidado" />
      <nav aria-label="Ver como" className="mb-3 flex flex-wrap items-center gap-1.5"><span className="text-[12.5px] text-muted">Ver como:</span>{chip('', 'Proprietário', !as)}{EMPLOYEES.filter((e) => !isOwner(e)).map((e) => chip(e.id, e.name, as?.id === e.id))}</nav>
      {as ? <Note tone="brand" title={`Visão de ${as.name}`} className="mb-4">{as.assignments.map((a) => `${UNITS.find((u) => u.id === a.unitId)?.name}: ${roleLabel(a.role)}`).join(' · ')}. As demais unidades não aparecem.</Note> : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Unidades visíveis" value={String(rows.length)} /><Stat label="Aulas hoje" value={String(sum((r) => r.lessonsToday))} /><Stat label="Pedidos da lojinha" value={String(sum((r) => r.orders))} /><Stat label="Itens em estoque" value={String(sum((r) => r.stockUnits))} />
      </div>
      <div className="mt-4"><DataTable rows={rows.map((r) => ({ ...r, id: r.unit.id }))} page={1} pageSize={10} hrefForPage={() => '#'} empty="Nenhuma unidade autorizada."
        columns={[{ key: 'u', header: 'Unidade', cell: (r) => <Link href={`/admin/business/unidades/${r.unit.id}`} className="font-semibold text-brand">{r.unit.name}</Link> }, { key: 'c', header: 'Cidade', cell: (r) => r.unit.city }, { key: 'a', header: 'Aulas hoje', cell: (r) => r.lessonsToday, className: 'tabular' },
          { key: 'f', header: 'Funcionários', cell: (r) => r.staff, className: 'tabular' }, { key: 'i', header: 'Instrutores', cell: (r) => r.instructors, className: 'tabular' }, { key: 'e', header: 'Estoque', cell: (r) => r.stockUnits, className: 'tabular' }, { key: 'p', header: 'Pedidos', cell: (r) => r.orders, className: 'tabular' }]} /></div>
      <p className="mt-3 text-[12px] text-muted">Visão de {viewer?.name}. A visão por funcionário é uma simulação da regra: no sistema real o banco filtra, não a tela.</p>
    </>
  );
}
