import type { Metadata } from 'next';

import { AreaSignup } from '@/components/auth/area-auth';

export const metadata: Metadata = { title: 'Criar conta' };

export default function SignupPage() {
  return <AreaSignup area="aluno" />;
}
