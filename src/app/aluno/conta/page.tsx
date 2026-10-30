import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon, type IconName } from '@/components/icon';
import { Avatar, ButtonLink, Card } from '@/components/ui';
import { STUDENT } from '@/data/demo';

export const metadata: Metadata = { title: 'Meu perfil' };

const PREFERENCES: readonly { title: string; body: string; icon: IconName; action: string }[] = [
  { title: 'Vento no seu celular', body: 'Seu próximo bordo a um toque.', icon: 'phone', action: 'Instalar' },
  { title: 'Notificações de aulas', body: 'Horários e novidades da sua reserva.', icon: 'bell', action: 'Ativar' },
];

export default function AccountPage() {
  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[28px] tracking-[-0.9px] sm:text-[32px]">Meu perfil</h1>
        <span className="text-[11px] text-muted">{STUDENT.region}</span>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="grid content-start gap-5">
          <Card>
            <div className="flex items-center gap-4">
              <Avatar initials={STUDENT.initials} tone="a3" size={56} />
              <div className="flex-1">
                <p className="text-[17px] font-semibold">{STUDENT.name}</p>
                <p className="text-[12px] text-muted">{STUDENT.language} · Aluno</p>
              </div>
            </div>
            <details className="mt-4 border-t border-line pt-4 text-[12px]">
              <summary className="cursor-pointer font-[550] text-brand">Expandir dados do perfil</summary>
              <dl className="mt-3 grid gap-2 text-muted">
                <div className="flex justify-between"><dt>Idioma</dt><dd className="text-ink">{STUDENT.language}</dd></div>
                <div className="flex justify-between"><dt>Região</dt><dd className="text-ink">{STUDENT.beaches}</dd></div>
                <div className="flex justify-between"><dt>E-mail</dt><dd className="text-ink">aluna@exemplo.com</dd></div>
              </dl>
            </details>
          </Card>
          <Card>
            <h2 className="text-[16px]">Do seu jeito</h2>
            <ul className="mt-3 divide-y divide-line">
              {PREFERENCES.map((item) => (
                <li key={item.title} className="flex items-center gap-3 py-3.5">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-tint text-brand"><Icon name={item.icon} className="!h-[18px] !w-[18px]" /></span>
                  <div className="flex-1">
                    <p className="text-[13px] font-[550]">{item.title}</p>
                    <p className="text-[11px] text-muted">{item.body}</p>
                  </div>
                  <span className="rounded-full bg-brand-soft px-3 py-1.5 text-[11px] font-[550] text-brand">{item.action}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="grid content-start gap-5">
          <Card tone="tinted">
            <h2 className="text-[16px]">Precisa de uma mão?</h2>
            <p className="mt-1 text-[12px] text-muted">Conte com a gente para sua aula.</p>
            <p className="mt-3 text-[12px] font-[550] text-brand">Menos pressa. Mais mar.</p>
            <ButtonLink href="/aluno/central" className="mt-4" trailingIcon="arrow">Abrir central de aulas</ButtonLink>
          </Card>
          <p className="px-1 text-[12px] leading-relaxed text-muted">
            Seu histórico acompanha você. Suas horas ficam vinculadas à reserva e ao instrutor contratado.
          </p>
          <Link href="/aluno/acesso" className="px-1 text-[12px] font-[550] text-brand">Conta e acesso →</Link>
        </div>
      </div>
    </>
  );
}
