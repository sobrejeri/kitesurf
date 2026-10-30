import type { Metadata } from 'next';

import { StudentHero } from '@/components/student/sunset';

import { Incidents } from '@/components/shared';

export const metadata: Metadata = { title: 'Imprevistos e cancelamentos' };

export default function StudentIncidentsPage() {
  return (
    <>
      <StudentHero eyebrow="Cada situação acompanhada" title="Imprevistos e cancelamentos" highlight="cancelamentos" lead="Cada pedido pertence a um encontro. Os demais encontros são preservados." compact image="lesson" />
      <Incidents bare />
    </>
  );
}
