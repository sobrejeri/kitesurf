import { Fragment } from 'react';

import { STAFF_TABS, SectionTabs } from '@/components/business/company-kit';
import { Icon } from '@/components/icon';
import { DemoBanner, PageHead, RoleBadge } from '@/components/business/kit';
import { Note } from '@/components/ui';
import { PERMISSIONS, ROLES, ROLE_PERMISSIONS } from '@/lib/business/demo';

export const metadata = { title: 'Permissões' };

export default function PermissionsPage() {
  const groups = [...new Set(PERMISSIONS.map((p) => p.group))];
  return (
    <>
      <DemoBanner />
      <PageHead title="Matriz de permissões" subtitle="O que cada cargo pode fazer. As permissões valem por unidade." />
      <SectionTabs label="Seções da equipe" tabs={STAFF_TABS} active="/admin/business/permissoes" />
      <div className="grid gap-4 lg:hidden">
        {groups.map((g) => (
          <section key={g} aria-label={g}>
            <h2 className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.8px] text-muted">{g}</h2>
            <ul className="divide-y divide-line rounded-[14px] border border-line bg-surface">
              {PERMISSIONS.filter((p) => p.group === g).map((p) => (
                <li key={p.id} className="p-3 text-[13px]">
                  <p className="text-ink">{p.label}{p.sensitive ? <span className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 text-[10.5px] font-semibold text-warning">Sensível</span> : null}</p>
                  <p className="mt-1.5 flex flex-wrap gap-1.5">{ROLES.filter((r) => ROLE_PERMISSIONS[r.id].includes(p.id)).map((r) => <RoleBadge key={r.id} role={r.id} />)}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="relative hidden overflow-x-auto rounded-[14px] border border-line bg-surface lg:block">
        <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
          <caption className="sr-only">Permissões por cargo</caption>
          <thead><tr className="border-b border-line bg-sand/60">
            <th scope="col" className="px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.8px] text-muted">Permissão</th>
            {ROLES.map((r) => <th key={r.id} scope="col" className="px-3 py-2.5 text-center"><RoleBadge role={r.id} /></th>)}
          </tr></thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g}>
                <tr className="bg-sand/40"><th colSpan={ROLES.length + 1} scope="colgroup" className="px-4 py-1.5 text-left text-[11.5px] font-semibold uppercase tracking-[0.8px] text-muted">{g}</th></tr>
                {PERMISSIONS.filter((p) => p.group === g).map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <th scope="row" className="px-4 py-2.5 font-normal text-ink">{p.label}{p.sensitive ? <span className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 text-[10.5px] font-semibold text-warning">Sensível</span> : null}</th>
                    {ROLES.map((r) => {
                      const yes = ROLE_PERMISSIONS[r.id].includes(p.id);
                      return <td key={r.id} className="px-3 py-2.5 text-center">
                        {yes ? <Icon name="check" className="mx-auto !h-5 !w-5 text-success" /> : <span className="text-muted" aria-hidden="true">—</span>}
                        <span className="sr-only">{yes ? 'Permitido' : 'Não permitido'}</span>
                      </td>;
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {ROLES.map((r) => <li key={r.id} className="rounded-[12px] border border-line bg-surface p-3 text-[13px]"><RoleBadge role={r.id} /><p className="mt-1.5 text-muted">{r.summary}</p></li>)}
      </ul>
      <Note className="mt-4" title="Operações sensíveis">Marcadas como “Sensível”, só o Proprietário (ou quem ele autorizar) executa. A regra será conferida no banco, não só na tela. A edição da matriz será ligada junto com o backend.</Note>
    </>
  );
}
