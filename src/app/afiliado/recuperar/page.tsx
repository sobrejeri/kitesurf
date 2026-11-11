import type { Metadata } from 'next';
import { PasswordRecovery } from '@/components/auth/password-recovery';
export const metadata: Metadata = { title: 'Recuperar acesso' };
export default async function Page({searchParams}: {searchParams: Promise<{erro?: string}>}) {
  const params = await searchParams;
  return <PasswordRecovery area="afiliado" invalidLink={params.erro === 'link'} />;
}
