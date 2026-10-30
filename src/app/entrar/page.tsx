import type { Metadata } from 'next';
import Link from 'next/link';

import { signIn } from '@/app/actions/auth';
import { ActionForm } from '@/components/action-form';
import { Logo } from '@/components/shells';
import { Card, Field, inputClass } from '@/components/ui';

export const metadata: Metadata = { title: 'Entrar' };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; confirmado?: string }> }) {
  const { next, confirmado } = await searchParams;
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <Logo />
      <h1 className="mt-8 text-[28px] tracking-[-0.9px]">Entrar</h1>
      <p className="mt-1 text-[13px] text-muted">Seu espaço no kite, do jeito que você deixou.</p>
      {confirmado ? <p className="mt-4 rounded-note bg-success-soft px-4 py-3 text-[12px] text-success">E-mail confirmado. Agora é só entrar.</p> : null}
      <Card className="mt-6">
        <ActionForm action={signIn} submitLabel="Entrar" className="grid gap-4" wideSubmit>
          <input type="hidden" name="next" value={next ?? ''} />
          <Field label="E-mail">
            <input name="email" type="email" required autoComplete="email" className={inputClass} />
          </Field>
          <Field label="Senha">
            <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
          </Field>
        </ActionForm>
      </Card>
      <p className="mt-5 text-center text-[13px] text-muted">
        Ainda não tem conta?{' '}
        <Link href="/cadastro" className="font-[550] text-brand">
          Criar conta
        </Link>
      </p>
    </main>
  );
}
