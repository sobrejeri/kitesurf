import { LinkForm } from '@/components/business/company-forms';
import { STAFF_TABS, SectionTabs } from '@/components/business/company-kit';
import { DemoBanner, PageHead, RoleBadge } from '@/components/business/kit';
import { EMPLOYEES, UNITS } from '@/lib/business/demo';
import { validateUnlink } from '@/lib/business/company';

export const metadata = { title: 'Vínculos com unidades' };

export default function LinksPage() {
  const units = UNITS.filter((u) => u.active);
  return (
    <>
      <DemoBanner />
      <PageHead title="Vínculos com unidades" subtitle="Quem trabalha em qual unidade e com qual cargo." />
      <SectionTabs label="Seções da equipe" tabs={STAFF_TABS} active="/admin/business/funcionarios/vinculos" />
      <div className="relative overflow-x-auto rounded-[14px] border border-line bg-surface">
        <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
          <caption className="sr-only">Cargo de cada funcionário em cada unidade</caption>
          <thead><tr className="border-b border-line bg-sand/60 text-[11.5px] uppercase tracking-[0.8px] text-muted"><th scope="col" className="px-4 py-2.5 font-semibold">Funcionário</th>{units.map((u) => <th key={u.id} scope="col" className="px-3 py-2.5 font-semibold">{u.name}</th>)}</tr></thead>
          <tbody>{EMPLOYEES.map((e) => <tr key={e.id} className="border-b border-line last:border-0"><th scope="row" className="px-4 py-2.5 text-left font-semibold text-ink">{e.name}</th>{units.map((u) => { const a = e.assignments.find((x) => x.unitId === u.id); return <td key={u.id} className="px-3 py-2.5">{a ? <span className="flex flex-col items-start gap-1"><RoleBadge role={a.role} />{validateUnlink(e.id, u.id) ? <span className="text-[11px] text-muted">Não removível</span> : null}</span> : <span className="text-muted">Sem acesso</span>}</td>; })}</tr>)}</tbody>
        </table>
      </div>
      <h2 className="mb-2 mt-6 text-[15px] font-semibold text-ink">Novo vínculo</h2>
      <LinkForm />
    </>
  );
}
