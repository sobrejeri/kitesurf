'use client';

import { useState } from 'react';

import { updateProfile } from '@/app/actions/student';
import { LANGUAGES } from '@/data/demo';

import { ActionForm } from '../action-form';
import { Icon } from '../icon';
import { Field, inputClass } from '../ui';

export function ProfileEditor({ fullName, language }: { fullName: string; language: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex justify-center sm:justify-start">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="press flex items-center gap-2 rounded-full border border-brand/70 px-4 py-2.5 text-[13px] font-semibold text-ink"
        >
          <Icon name="edit" className="!h-4 !w-4 text-brand" />
          {open ? 'Fechar' : 'Editar perfil'}
        </button>
      </div>
      {open ? (
        <div className="basis-full">
          <ActionForm action={updateProfile} submitLabel="Salvar"
            submitAlign="justify-self-center sm:justify-self-start" className="mt-4 grid gap-4">
            <Field label="Nome">
              <input name="fullName" defaultValue={fullName} required minLength={2} maxLength={120} autoComplete="name" className={inputClass} />
            </Field>
            <Field label="Idioma das aulas">
              <select name="language" defaultValue={language} className={inputClass}>
                {LANGUAGES.map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
          </ActionForm>
        </div>
      ) : null}
    </>
  );
}
