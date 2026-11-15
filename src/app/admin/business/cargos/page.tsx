import { RoleForm } from '@/components/business/company-forms';
import { STAFF_TABS, SectionTabs } from '@/components/business/company-kit';
import { DataTable, DemoBanner, PageHead, RoleBadge } from '@/components/business/kit';
import { Note } from '@/components/ui';
import { EMPLOYEES, PERMISSIONS, ROLES, ROLE_PERMISSIONS } from '@/lib/business/demo';

export const metadata = { title: 'Cargos' };

export default function RolesPage() {
  return (
    <>
      <DemoBanner />
      <PageHead title="Cargos" subtitle="Os quatro cargos iniciais e os cargos personalizados da empresa." />
      <SectionTabs label="Seções da equipe" tabs={STAFF_TABS} active="/admin/business/cargos" />
      <DataTable rows={ROLES} page={1} pageSize={10} hrefForPage={() => '#'} empty="Nenhum cargo."
        columns={[{ key: 'r', header: 'Cargo', cell: (r) => <RoleBadge role={r.id} /> }, { key: 's', header: 'Resumo', cell: (r) => r.summary }, { key: 'p', header: 'Permissões', cell: (r) => `${ROLE_PERMISSIONS[r.id].length} de ${PERMISSIONS.length}`, className: 'tabular' },
          { key: 'm', header: 'Vínculos', cell: (r) => String(EMPLOYEES.flatMap((e) => e.assignments).filter((a) => a.role === r.id).length), className: 'tabular' }]} />
      <Note className="mt-4" title="Permissões sensíveis">Alterar permissões, convidar pessoas, fechar caixa e vincular instrutores são sensíveis: só valem com autorização do Proprietário e a regra será conferida no banco.</Note>
      <h2 className="mb-2 mt-6 text-[15px] font-semibold text-ink">Novo cargo personalizado</h2>
      <RoleForm />
    </>
  );
}
