import type { Metadata } from 'next';

import { AreaLogin } from '@/components/auth/area-auth';

export const metadata: Metadata = { title: 'Entrar' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; confirmado?: string; erro?: string }> }) {
  const { next, confirmado, erro } = await searchParams;
  return <AreaLogin area="admin" next={next} confirmed={Boolean(confirmado)} wrongAccount={erro === 'conta'} />;
}
