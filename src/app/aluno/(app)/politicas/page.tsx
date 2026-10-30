import type { Metadata } from 'next';

import { StudentHero } from '@/components/student/sunset';

import { Policies } from '@/components/shared';

export const metadata: Metadata = { title: 'Políticas das aulas' };

export default function StudentPoliciesPage() {
  return (
    <>
      <StudentHero eyebrow="Regras antes da reserva" title="Políticas das aulas" highlight="aulas" lead="Rascunho comercial: condições ainda não publicadas como contrato definitivo." compact />
      <Policies bare />
    </>
  );
}
