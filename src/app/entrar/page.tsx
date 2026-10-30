import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon, type IconName } from '@/components/icon';
import { StudentBrand } from '@/components/student/sunset';
import { APP_AREAS, type AppArea } from '@/lib/app-areas';

export const metadata: Metadata = { title: 'Escolha seu app' };

const CHOICES: readonly { area: AppArea; icon: IconName; text: string }[] = [
  { area: 'aluno', icon: 'kite', text: 'Quero fazer aulas' },
  { area: 'instrutor', icon: 'users', text: 'Sou instrutor' },
  { area: 'pousada', icon: 'home', text: 'Sou pousada parceira' },
  { area: 'admin', icon: 'shield', text: 'Equipe de operação' },
];

/** Each kind of account has its own app and its own login. */
export default function ChooseAppPage() {
  return (
    <div className="theme-sunset min-h-dvh bg-canvas text-ink">
      <main className="pt-safe mx-auto max-w-md px-5 py-8">
        <StudentBrand />
        <h1 className="mt-10 text-[32px] font-bold leading-tight tracking-[-0.8px]">
          Como você usa o <span className="text-brand">Vento?</span>
        </h1>
        <p className="mt-2 text-[15px] text-label">Cada perfil tem seu próprio app e seu próprio login.</p>
        <ul className="mt-6 grid gap-3">
          {CHOICES.map((choice) => (
            <li key={choice.area}>
              <Link href={`/${choice.area}/entrar`} className="press flex items-center gap-4 rounded-[18px] border border-line bg-surface p-4">
                <span className="grid h-12 w-12 place-items-center rounded-[14px] bg-brand-soft text-brand">
                  <Icon name={choice.icon} />
                </span>
                <span className="flex-1">
                  <strong className="block text-[16px] font-semibold">{choice.text}</strong>
                  <span className="text-[13px] text-muted">{APP_AREAS[choice.area].appName}</span>
                </span>
                <Icon name="chevron" className="!h-5 !w-5 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
