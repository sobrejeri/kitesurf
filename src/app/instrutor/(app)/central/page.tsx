import type { Metadata } from 'next';

import { AdminTitle, HubSections } from '@/components/admin/kit';
import { Note } from '@/components/ui';
import { INSTRUCTOR_NAV } from '@/components/workspace-nav';

export const metadata: Metadata = { title: 'Central de trabalho' };

export default function InstructorHubPage() {
  const titles = [...new Set(INSTRUCTOR_NAV.map((item) => item.group))];
  const sections = titles.map((title) => ({
    title,
    items: INSTRUCTOR_NAV.filter((item) => item.group === title && item.href !== '/instrutor/central'),
  }));
  return (
    <>
      <AdminTitle title="Central de trabalho" subtitle="Tudo do seu trabalho em um só lugar, na mesma ordem do menu." />
      <HubSections sections={sections} />
      <Note className="mt-6">
        Disponibilidade, documentos, aulas e ocorrências são registrados na sua conta. Esta fase de validação não realiza cobranças nem repasses.
      </Note>
    </>
  );
}
