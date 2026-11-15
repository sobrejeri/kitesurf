'use client';

import { useEffect, useRef, useState } from 'react';

import { Button, Field, Note, inputClass } from '@/components/ui';

/** Confirmation modal with an optional required reason. Escape closes it; focus returns to the opener. */
export function ConfirmDialog({ trigger, title, description, confirmLabel, reasonLabel, doneMessage, danger = false }: {
  trigger: string; title: string; description: string; confirmLabel: string; reasonLabel?: string; doneMessage: string; danger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const refocus = () => wrap.current?.querySelector('button')?.focus();
  const close = () => { setOpen(false); refocus(); };
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); refocus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const confirm = () => {
    if (reasonLabel && reason.trim().length < 8) { setError('Explique o motivo com pelo menos 8 caracteres.'); return; }
    setError(''); setDone(true); setOpen(false);
  };
  return (
    <>
      <span ref={wrap}><Button type="button" variant={danger ? 'danger' : 'ghost'} size="sm" onClick={() => { setDone(false); setOpen(true); }}>{trigger}</Button></span>
      {done ? <Note icon="check" className="mt-3">{doneMessage}</Note> : null}
      {open ? (
        <div role="dialog" aria-modal="true" aria-labelledby="dlg-title" className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" onClick={close}>
          <div className="w-full max-w-md rounded-[18px] bg-surface p-5 shadow-card" onClick={(e) => e.stopPropagation()}>
            <h2 id="dlg-title" className="text-[17px] font-semibold text-ink">{title}</h2>
            <p className="mt-1.5 text-[13px] text-muted">{description}</p>
            {reasonLabel ? (
              <div className="mt-4">
                <Field label={reasonLabel}>
                  <input name="reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={Boolean(error)} className={inputClass} autoFocus />
                  {error ? <span role="alert" className="text-[12px] text-danger">{error}</span> : null}
                </Field>
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={close}>Voltar</Button>
              <Button type="button" variant={danger ? 'danger' : 'primary'} size="sm" onClick={confirm}>{confirmLabel}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
