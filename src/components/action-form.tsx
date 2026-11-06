'use client';

import { useActionState } from 'react';

import type { ActionState } from '@/app/actions/errors';

import { Button, Note } from './ui';

/**
 * A form bound to a server action, with the pending state on the button and
 * the action's result shown under it.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  submitVariant = 'primary',
  className = '',
  wideSubmit = false,
  submitAlign = 'justify-self-start',
  submitClassName = '',
  disabled = false,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children?: React.ReactNode;
  submitLabel: string;
  submitVariant?: 'primary' | 'ghost' | 'soft' | 'danger';
  className?: string;
  wideSubmit?: boolean;
  /** justify-self utility for the submit button when not wideSubmit. */
  submitAlign?: string;
  submitClassName?: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      {children}
      <Button type="submit" variant={submitVariant} disabled={pending || disabled} className={`${wideSubmit ? 'w-full' : submitAlign} ${submitClassName}`}>
        {pending ? 'Enviando…' : submitLabel}
      </Button>
      {state.error ? (
        <Note tone="warning" icon="info" className="mt-1">
          {state.error}
        </Note>
      ) : null}
      {state.ok ? (
        <Note icon="check" className="mt-1">
          {state.ok}
        </Note>
      ) : null}
    </form>
  );
}
