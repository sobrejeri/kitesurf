import type { Metadata } from 'next';
import Link from 'next/link';

import { signUp } from '@/app/actions/auth';
import { ActionForm } from '@/components/action-form';
import { Logo } from '@/components/shells';
import { Card, Field, inputClass } from '@/components/ui';

export const metadata: Metadata = { title: 'Criar conta' };

const ROLES = [
  { value: 'student', label: 'Quero fazer aulas', hint: 'Aluno' },
  { value: 'instructor', label: 'Sou instrutor', hint: 'Passa por análise antes de receber pedidos' },
  { value: 'partner', label: 'Sou pousada', hint: 'Indique hóspedes e receba comissão' },
] as const;

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ perfil?: string }> }) {
  const { perfil } = await searchParams;
  const preset = ROLES.some((role) => role.value === perfil) ? perfil : 'student';
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <Logo />
      <h1 className="mt-8 text-[28px] tracking-[-0.9px]">Criar conta</h1>
      <p className="mt-1 text-[13px] text-muted">Da vontade de aprender ao primeiro bordo.</p>
      <Card className="mt-6">
        <ActionForm action={signUp} submitLabel="Criar conta" className="grid gap-4" wideSubmit>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-[12px] font-medium text-label">Como você vai usar o Vento?</legend>
            {ROLES.map((role) => (
              <label key={role.value} className="flex cursor-pointer items-start gap-3 rounded-search border border-line px-4 py-3 has-[:checked]:border-brand has-[:checked]:bg-brand-tint">
                <input type="radio" name="role" value={role.value} defaultChecked={role.value === preset} className="mt-1 accent-brand" />
                <span>
                  <span className="block text-[13px] font-[550]">{role.label}</span>
                  <span className="text-[11px] text-muted">{role.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <Field label="Nome">
            <input name="fullName" required minLength={2} maxLength={120} autoComplete="name" className={inputClass} />
          </Field>
          <Field label="E-mail">
            <input name="email" type="email" required autoComplete="email" className={inputClass} />
          </Field>
          <Field label="Senha" hint="Pelo menos 8 caracteres.">
            <input name="password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
          </Field>
        </ActionForm>
      </Card>
      <p className="mt-5 text-center text-[13px] text-muted">
        Já tem conta?{' '}
        <Link href="/entrar" className="font-[550] text-brand">
          Entrar
        </Link>
      </p>
    </main>
  );
}
