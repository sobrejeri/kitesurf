import type { Metadata } from 'next';

import { Incidents } from '@/components/shared';

export const metadata: Metadata = { title: 'Ocorrências' };

export default function InstructorIncidentsPage() {
  return <Incidents />;
}
