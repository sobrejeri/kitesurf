'use client';

import { useState } from 'react';

import { Button, Field, Note, inputClass } from '@/components/ui';
import type { Unit } from '@/lib/business/demo';
import { validateUnit, type UnitInput } from '@/lib/business/rules';

/** Validates like the real form will; saving is off until the Business tables exist. */
export function UnitForm({ unit }: { unit?: Unit }) {
  const [v, setV] = useState<UnitInput>({
    name: unit?.name ?? '', city: unit?.city ?? '', address: unit?.address ?? '',
    opens: unit?.opens ?? '08:00', closes: unit?.closes ?? '17:00', lat: unit ? String(unit.lat) : '', lng: unit ? String(unit.lng) : '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const set = (k: keyof UnitInput) => (e: React.ChangeEvent<HTMLInputElement>) => { setDone(false); setV({ ...v, [k]: e.target.value }); };
  const submit = (e: React.FormEvent) => { e.preventDefault(); const next = validateUnit(v); setErrors(next); setDone(Object.keys(next).length === 0); };
  const f = (k: keyof UnitInput, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label}>
      <input name={k} value={v[k]} onChange={set(k)} aria-invalid={Boolean(errors[k])} aria-describedby={errors[k] ? `${k}-err` : undefined} className={inputClass} {...extra} />
      {errors[k] ? <span id={`${k}-err`} role="alert" className="text-[12px] text-danger">{errors[k]}</span> : null}
    </Field>
  );
  return (
    <form onSubmit={submit} noValidate className="grid max-w-3xl gap-4 rounded-[16px] border border-line bg-surface p-4 shadow-card sm:grid-cols-2 sm:p-5">
      <div className="sm:col-span-2">{f('name', 'Nome da unidade')}</div>
      {f('city', 'Cidade')}
      {f('address', 'Endereço')}
      {f('lat', 'Latitude (opcional)', { inputMode: 'decimal', placeholder: '-2.79' })}
      {f('lng', 'Longitude (opcional)', { inputMode: 'decimal', placeholder: '-40.51' })}
      {f('opens', 'Abre às', { type: 'time' })}
      {f('closes', 'Fecha às', { type: 'time' })}
      <div className="grid gap-3 sm:col-span-2">
        {done ? <Note icon="check">Dados válidos. Gravação desativada na demonstração: ela será ligada quando as tabelas do Business forem aprovadas.</Note> : null}
        <Button type="submit" className="justify-self-start">{unit ? 'Validar alterações' : 'Validar cadastro'}</Button>
      </div>
    </form>
  );
}
