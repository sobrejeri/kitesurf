import type { Metadata } from 'next';

import { DesktopPageHeader } from '@/components/student/desktop-page-header';
import { StudentPageTitle } from '@/components/student/page-title';
import { Policies } from '@/components/shared';

export const metadata: Metadata = { title: 'Políticas das aulas' };

export default function StudentPoliciesPage() {
  return (
    <div className="vento-pc-secondary-page vento-pc-policies-screen vento-mobile-appbar-clearance">
      <DesktopPageHeader eyebrow="REGRAS E TRANSPARÊNCIA"
        title="Regras das aulas"
        lead="Consulte condições, segurança e orientações antes de contratar."
        icon="file"
        backHref="/aluno/inicio" variant="coast"/>
      <div className="vento-pc-secondary-main">
        <StudentPageTitle title="Regras das aulas" subtitle="Rascunho comercial, ainda não é o contrato definitivo"/>
        <Policies bare />
      </div>
    </div>
  );
}
