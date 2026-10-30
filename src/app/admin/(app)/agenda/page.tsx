import type { Metadata } from 'next';

import { Agenda } from '@/components/shared';

export const metadata: Metadata = { title: 'Agenda de aulas' };

export default function AdminAgendaPage() {
  return <Agenda subtitle="Instrutores, alunos e encontros em um só lugar" perspective="admin" />;
}
