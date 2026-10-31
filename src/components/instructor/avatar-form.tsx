'use client';

import { useActionState, useState } from 'react';

import { uploadInstructorAvatar } from '@/app/actions/instructor-profile';
import { Button, Field, Note } from '@/components/ui';

const MAX_BYTES = 3 * 1024 * 1024;
const ACCEPTED_FORMATS = ['image/jpeg', 'image/png', 'image/webp'];

function validatePhoto(file: File | undefined): string | null {
  if (!file) return 'Selecione uma foto antes de enviar.';
  if (!ACCEPTED_FORMATS.includes(file.type)) {
    return 'Formato não aceito. Selecione uma foto JPG, PNG ou WebP.';
  }
  if (file.size > MAX_BYTES) {
    return 'A foto tem mais de 3 MB. Escolha uma versão menor antes de enviar.';
  }
  if (!file.size) return 'O arquivo está vazio. Selecione outra foto.';
  return null;
}

/** Upload errors remain inside the profile instead of opening its error page. */
export function InstructorAvatarForm() {
  const [state, formAction, pending] = useActionState(uploadInstructorAvatar, {});
  const [selected, setSelected] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  return (
    <form
      action={formAction}
      className="mt-4 grid gap-3"
      encType="multipart/form-data"
      onSubmit={(event) => {
        const input = event.currentTarget.elements.namedItem('avatar') as HTMLInputElement | null;
        const validation = validatePhoto(input?.files?.[0]);
        if (validation) {
          event.preventDefault();
          setPhotoError(validation);
        }
      }}
    >
      <Field label="Foto do perfil" hint="JPG, PNG ou WebP · até 3 MB.">
        <input
          type="file"
          name="avatar"
          accept="image/jpeg,image/png,image/webp"
          required
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            setSelected(Boolean(file));
            setPhotoError(file ? validatePhoto(file) : null);
          }}
          className="block w-full min-w-0 rounded-[14px] border border-line-input bg-surface p-2 text-[12px] text-ink file:mr-3 file:rounded-full file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-semibold file:text-brand"
        />
      </Field>
      {photoError ? <p className="text-[12px] font-semibold text-warning" role="alert">{photoError}</p> : null}
      <Button
        type="submit"
        disabled={pending || !selected || Boolean(photoError)}
        className="justify-self-start"
      >
        {pending ? 'Enviando foto…' : 'Salvar foto'}
      </Button>
      {state.error ? <Note tone="warning" className="mt-1">{state.error}</Note> : null}
      {state.ok ? <Note icon="check" className="mt-1">{state.ok}</Note> : null}
    </form>
  );
}
