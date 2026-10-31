'use client';

import { useEffect } from 'react';

import { Icon } from '@/components/icon';

/**
 * Keeps navigation usable if a student-only API request fails.
 * The server logs include the PostgREST error code for diagnosis.
 */
export default function StudentAreaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[student-area] Unable to render', error);
  }, [error]);

  return (
    <section role="alert" className="mx-auto mt-28 max-w-lg rounded-[26px] border border-line bg-surface p-7 text-ink shadow-card md:mt-8">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand" aria-hidden="true">
        <Icon name="info" className="!h-6 !w-6" />
      </span>
      <h1 className="mt-5 text-2xl font-bold">Não foi possível carregar esta tela</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Ocorreu um problema ao buscar suas informações. Suas reservas não foram alteradas.
      </p>
      <button
        type="button"
        onClick={reset}
        className="press mt-6 min-h-12 rounded-full bg-brand px-6 font-semibold text-on-brand"
      >
        Tentar novamente
      </button>
    </section>
  );
}
