'use client';

import { useState } from 'react';

import { Button, Field, Note, inputClass } from '@/components/ui';
import type { Service } from '@/lib/business/demo';
import { validateService, type ServiceInput } from '@/lib/business/services';

const reais = (cents: number) => `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;

/** Validates like the real form will; saving is off until the Business tables exist. */
export function ServiceForm({ service }: { service?: Service }) {
  const [v, setV] = useState<ServiceInput>({
    name: service?.name ?? '', minutes: String(service?.minutes ?? 60), capacity: String(service?.capacity ?? 2), price: service ? reais(service.baseCents) : '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const set = (k: keyof ServiceInput) => (e: React.ChangeEvent<HTMLInputElement>) => { setDone(false); setV({ ...v, [k]: e.target.value }); };
  const submit = (e: React.FormEvent) => { e.preventDefault(); const next = validateService(v); setErrors(next); setDone(Object.keys(next).length === 0); };
  const f = (k: keyof ServiceInput, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label}>
      <input name={k} value={v[k]} onChange={set(k)} aria-invalid={Boolean(errors[k])} aria-describedby={errors[k] ? `${k}-err` : undefined} className={inputClass} {...extra} />
      {errors[k] ? <span id={`${k}-err`} role="alert" className="text-[12px] text-danger">{errors[k]}</span> : null}
    </Field>
  );
  return (
    <form onSubmit={submit} noValidate className="grid max-w-3xl gap-4 rounded-[16px] border border-line bg-surface p-4 shadow-card sm:grid-cols-2 sm:p-5">
      <div className="sm:col-span-2">{f('name', 'Nome do serviço')}</div>
      {f('minutes', 'Duração (minutos)', { inputMode: 'numeric' })}
      {f('capacity', 'Capacidade (alunos por aula)', { inputMode: 'numeric' })}
      <div className="sm:col-span-2">{f('price', 'Preço base (R$)', { inputMode: 'decimal', placeholder: '260,00' })}</div>
      <div className="grid gap-3 sm:col-span-2">
        {done ? <Note icon="check">Dados válidos. Gravação desativada na demonstração: ela será ligada quando as tabelas do Business forem aprovadas.</Note> : null}
        <Button type="submit" className="justify-self-start">{service ? 'Validar alterações' : 'Validar cadastro'}</Button>
      </div>
    </form>
  );
}
