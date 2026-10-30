import type { Metadata } from 'next';

import { Policies } from '@/components/shared';

export const metadata: Metadata = { title: 'Regras das aulas' };

export default function InstructorPoliciesPage() {
  return <Policies />;
}
