'use client';

import { useEffect } from 'react';

import { Icon } from '@/components/icon';

export default function InstructorAreaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[instructor-area] Unable to render', error);
  }, [error]);

  return (
    <main className="theme-sunset min-h-screen bg-canvas px-4 py-16 text-ink">
      <section role="alert" className="mx-auto max-w-lg rounded-[26px] border border-line bg-surface p-7 shadow-card">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand" aria-hidden="true">
          <Icon name="info" className="!h-6 !w-6" />
        </span>
        <h1 className="mt-5 text-2xl font-bold">Não foi possível carregar o painel do instrutor</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Ocorreu um problema ao consultar suas informações. Suas aulas e seu cadastro não foram alterados.
        </p>
        <button type="button" onClick={reset} className="press mt-6 min-h-12 rounded-full bg-brand px-6 font-semibold text-on-brand">
          Tentar novamente
        </button>
        <a href="/instrutor/central" className="mt-4 block text-sm font-semibold text-brand underline">Abrir central do instrutor</a>
      </section>
    </main>
  );
}
