import { Panel } from '@/components/admin/kit';
import { CompanyEditForm } from '@/components/business/company-forms';
import { COMPANY_TABS, SectionTabs } from '@/components/business/company-kit';
import { DemoBanner, PageHead } from '@/components/business/kit';
import { Note } from '@/components/ui';
import { COMPANY, COMPANY_PROFILE as P, UNITS } from '@/lib/business/demo';
import { formatCnpj } from '@/lib/business/company';
import { dayLabel } from '@/lib/business/rules';

export const metadata = { title: 'Perfil da empresa' };

export default function CompanyProfile() {
  return (
    <>
      <DemoBanner />
      <PageHead title="Perfil da empresa" subtitle={`${COMPANY.name} · plano ${COMPANY.plan}`} />
      <SectionTabs label="Seções da empresa" tabs={COMPANY_TABS} active="/admin/business/empresa" />
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Dados cadastrais"><dl className="grid gap-2 text-[13px]">
          {([['Razão social', P.legalName], ['Nome fantasia', P.tradeName], ['CNPJ', formatCnpj(P.cnpj)], ['Responsável', P.ownerName], ['Cliente desde', dayLabel(P.sinceOffset)], ['Unidades', `${UNITS.filter((u) => u.active).length} ativas de ${UNITS.length}`]] as const).map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-right font-medium text-ink">{v}</dd></div>)}
        </dl></Panel>
        <Note tone="warning" title="Segurança da empresa">Cada empresa só enxerga os próprios dados. Reservas e clientes de outra escola nunca aparecem aqui. A troca de CNPJ ou de proprietário passa pela conferência da administração do VentoKite.</Note>
      </div>
      <h2 className="mb-2 text-[15px] font-semibold text-ink">Editar dados</h2>
      <CompanyEditForm />
    </>
  );
}
