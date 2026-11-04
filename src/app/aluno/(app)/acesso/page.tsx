import type { Metadata } from 'next';

import { signOut } from '@/app/actions/auth';
import { requireRole } from '@/lib/auth';
import { StudentHero } from '@/components/student/sunset';
import { ButtonLink, Card } from '@/components/ui';

export const metadata: Metadata = { title: 'Conta e acesso' };

export default async function AccessPage() {
  const viewer = await requireRole(['student'], '/aluno/acesso');
  return (
    <div>
      <StudentHero eyebrow="Seu espaço no kite" title="Conta e acesso" highlight="acesso" compact />
      <Card>
        <h2 className="text-[18px] font-bold text-ink">Sua conta</h2>
        <p className="mt-3 text-[14px] text-label">{viewer.fullName || 'Aluno'}</p>
        <p className="mt-1 break-words text-[14px] text-muted">{viewer.email}</p>
        <ButtonLink href="/aluno/conta" className="mt-5" variant="ghost">Editar meu perfil</ButtonLink>
        <ButtonLink href="/aluno/recuperar" className="ml-3 mt-5" variant="ghost">Redefinir senha por e-mail</ButtonLink>
        <form action={signOut} className="mt-4">
          <button className="min-h-11 text-[14px] font-semibold text-brand underline">Sair desta conta</button>
        </form>
      </Card>
    </div>
  );
}
