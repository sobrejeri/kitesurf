import type { Metadata } from 'next';

import { Incidents } from '@/components/shared';

export const metadata: Metadata = { title: 'Imprevistos e cancelamentos' };

export default function StudentIncidentsPage() {
  return <Incidents />;
}
