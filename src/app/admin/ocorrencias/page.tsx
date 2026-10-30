import type { Metadata } from 'next';

import { Incidents } from '@/components/shared';

export const metadata: Metadata = { title: 'Analisar ocorrências' };

export default function AdminIncidentsPage() {
  return <Incidents title="Analisar ocorrências" />;
}
