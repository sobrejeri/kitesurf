import type { Metadata } from 'next';
import { DesktopPageHeader } from '@/components/student/desktop-page-header';

import { StudentHero } from '@/components/student/sunset';

import { Policies } from '@/components/shared';

export const metadata: Metadata = { title: 'Políticas das aulas' };

export default function StudentPoliciesPage() {
  return (
    <div className="vento-pc-secondary-page vento-pc-policies-screen">
      <DesktopPageHeader eyebrow="REGRAS E TRANSPARÊNCIA"
        title="Regras das aulas"
        lead="Consulte condições, segurança e orientações antes de contratar."
        icon="file"
        backHref="/aluno/inicio" variant="coast"/>
      <div className="vento-pc-original-hero">
      <StudentHero eyebrow="Regras antes da reserva" title="Políticas das aulas" highlight="aulas" lead="Rascunho comercial: condições ainda não publicadas como contrato definitivo." compact />
      </div>
      <div className="vento-pc-secondary-main">
      <Policies bare />
      </div>
    </div>
  );
}
