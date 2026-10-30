import type { Metadata } from 'next';

import { Policies } from '@/components/shared';

export const metadata: Metadata = { title: 'Políticas das aulas' };

export default function StudentPoliciesPage() {
  return <Policies />;
}
