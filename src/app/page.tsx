import Link from 'next/link';

import { Icon, type IconName } from '@/components/icon';
import { Logo } from '@/components/shells';
import { Note } from '@/components/ui';
import { DEMO_NOTICE } from '@/data/demo';

const AREAS: readonly { title: string; body: string; href: string; icon: IconName }[] = [
  { title: 'Aluno', body: 'Escolher horas, reservar, acompanhar aulas e evolução.', href: '/aluno/inicio', icon: 'user' },
  { title: 'Instrutor', body: 'Meu dia, fila, agenda, registro de aula e financeiro.', href: '/instrutor/central', icon: 'kite' },
  { title: 'Admin', body: 'Visão geral, distribuição, reservas, regras e financeiro.', href: '/admin/central', icon: 'chart' },
  { title: 'Pousada', body: 'Indicações, link de divulgação e comissões.', href: '/pousada/inicio', icon: 'home' },
];

export default function IndexPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-8">
      <Logo />
      <h1 className="mt-8 text-[32px] leading-tight tracking-[-0.9px]">Esboço navegável</h1>
      <p className="mt-2 max-w-xl text-[13px] leading-[1.8] text-muted">
        Plataforma de aulas de kitesurf em Preá e Jericoacoara. Escolha um perfil para navegar pelas telas.
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {AREAS.map((area) => (
          <li key={area.href}>
            <Link
              href={area.href}
              className="flex h-full items-start gap-4 rounded-card border border-line bg-surface p-6 shadow-card transition hover:border-brand-focus"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-tint text-brand">
                <Icon name={area.icon} />
              </span>
              <span>
                <strong className="block text-[16px] font-semibold">{area.title}</strong>
                <span className="mt-1 block text-[13px] text-muted">{area.body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Note className="mt-8">{DEMO_NOTICE}</Note>
    </main>
  );
}
