import type { Metadata } from 'next';

import { SecondFactorScreen } from '@/components/auth/second-factor';

export const metadata: Metadata = { title: 'Verificação em duas etapas' };

export default async function SecondFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <SecondFactorScreen area="instrutor" next={typeof next === 'string' ? next : undefined} />;
}
