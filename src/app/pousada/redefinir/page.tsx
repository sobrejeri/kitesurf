import type { Metadata } from 'next';
import { PasswordReset } from '@/components/auth/password-recovery';
export const metadata: Metadata = { title: 'Nova senha' };
export default function Page() { return <PasswordReset area="pousada" />; }
