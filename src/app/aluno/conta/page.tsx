import type { Metadata } from 'next';

import { signOut } from '@/app/actions/auth';
import { Avatar, Button, ButtonLink, Card } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { initials } from '@/lib/people';

export const metadata: Metadata = { title: 'Meu perfil' };

export default async function AccountPage() {
  const viewer = await requireRole(['student'], '/aluno/conta');
  return (
    <>
      <h1 className="mb-5 text-[28px] tracking-[-0.9px] sm:text-[32px]">Meu perfil</h1>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-4">
            <Avatar initials={initials(viewer.fullName)} tone="a3" size={56} />
            <div className="flex-1">
              <p className="text-[17px] font-semibold">{viewer.fullName || 'Sem nome'}</p>
              <p className="text-[12px] text-muted">{viewer.language} · Aluno</p>
            </div>
          </div>
          <dl className="mt-5 grid gap-2 border-t border-line pt-4 text-[12px] text-muted">
            <div className="flex justify-between"><dt>E-mail</dt><dd className="text-ink">{viewer.email}</dd></div>
            <div className="flex justify-between"><dt>Idioma</dt><dd className="text-ink">{viewer.language}</dd></div>
          </dl>
          <form action={signOut} className="mt-5">
            <Button type="submit" variant="ghost">Sair da conta</Button>
          </form>
        </Card>
        <Card tone="tinted" className="self-start">
          <h2 className="text-[16px]">Precisa de uma mão?</h2>
          <p className="mt-1 text-[12px] text-muted">Conte com a gente para sua aula.</p>
          <p className="mt-3 text-[12px] font-[550] text-brand">Menos pressa. Mais mar.</p>
          <ButtonLink href="/aluno/central" className="mt-4" trailingIcon="arrow">Abrir central de aulas</ButtonLink>
          <p className="mt-4 text-[12px] leading-relaxed text-muted">
            Seu histórico acompanha você. Suas horas ficam vinculadas à reserva e ao instrutor contratado.
          </p>
        </Card>
      </div>
    </>
  );
}
