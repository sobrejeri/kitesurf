import type { Metadata } from 'next';

import { Agenda } from '@/components/shared';

export const metadata: Metadata = { title: 'Agenda e bloqueios' };

export default function InstructorAgendaPage() {
  return <Agenda subtitle="Seus encontros e horários reservados" perspective="instructor" />;
}
