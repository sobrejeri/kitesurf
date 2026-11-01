'use client';

import { useActionState, useRef, useState, type ChangeEvent } from 'react';
import type { ActionState } from '@/app/actions/errors';
import { Icon } from '@/components/icon';

const MAX_PHOTO_SIZE = 3 * 1024 * 1024;
const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type Props = {
  action: (previous: ActionState, form: FormData) => Promise<ActionState>;
  photoUrl: string | null;
  name: string;
  accent?: 'orange' | 'cyan';
  enabled?: boolean;
};

/**
 * Instagram-style avatar: no photo = click the centered +; existing photo =
 * click the overlaid + in the bottom-right corner. Selecting a file starts
 * the upload automatically; there is no extra "choose file / save" area.
 */
export function ProfilePhotoPicker({ action, photoUrl, name, accent = 'orange', enabled = true }: Props) {
  const [result, submitAction, pending] = useActionState(action, {});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [filename, setFilename] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasPhoto = Boolean(photoUrl);
  const isOrange = accent === 'orange';
  const tone = isOrange ? 'text-[#ff861e]' : 'text-[#00dfed]';

  function choosePhoto() {
    if (pending || !enabled || !inputRef.current) return;
    // Allow picking the same picture again after a failed upload on iOS.
    inputRef.current.value = '';
    setValidationError(null);
    inputRef.current.click();
  }

  function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    let error: string | null = null;
    if (!MIME_TYPES.includes(file.type)) error = 'Escolha uma foto JPG, PNG ou WebP.';
    else if (file.size > MAX_PHOTO_SIZE) error = 'A imagem deve ter no máximo 3 MB.';
    else if (!file.size) error = 'O arquivo selecionado está vazio.';
    setValidationError(error);
    setFilename(file.name);
    if (error) {
      event.currentTarget.value = '';
      return;
    }
    // Submit only after a real file selection. iOS Safari offers Camera,
    // Photo Library and Files using the native file input dialog.
    formRef.current?.requestSubmit();
  }

  return (
    <form action={submitAction} ref={formRef} className="flex min-w-0 flex-col items-center sm:items-start">
      <input
        ref={inputRef}
        type="file"
        name="avatar"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label="Selecionar foto de perfil"
        onChange={onFileChosen}
        disabled={!enabled || pending}
      />
      <div className="relative h-[118px] w-[118px] shrink-0">
        <div className={'absolute inset-0 overflow-hidden rounded-full border-2 border-white/20 bg-[#173148] ' + (isOrange ? 'ring-2 ring-[#ff861e]/20' : 'ring-2 ring-[#00ddeb]/20')}>
          {photoUrl ? (
            <img src={photoUrl} alt={'Foto de perfil de ' + name} className="h-full w-full object-cover" />
          ) : null}
        </div>
        {hasPhoto ? (
          <button
            type="button"
            aria-label="Atualizar foto de perfil"
            title="Atualizar foto"
            onClick={choosePhoto}
            disabled={pending || !enabled}
            className="press absolute -bottom-0.5 -right-1 grid h-[44px] w-[44px] place-items-center rounded-full border-[4px] border-[#07182b] bg-white text-[#14253b] shadow-lg disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <Icon name="plus" className="!h-5 !w-5" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Adicionar foto de perfil"
            title="Adicionar foto"
            onClick={choosePhoto}
            disabled={pending || !enabled}
            className={'press absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full border-2 border-dashed border-white/30 bg-[#112e44] text-center disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ' + tone}
          >
            <Icon name="plus" className="!h-8 !w-8" />
            <span className="px-2 text-[11px] font-semibold leading-tight text-white">Adicionar foto</span>
          </button>
        )}
      </div>
      <div aria-live="polite" className="mt-2 max-w-[280px] text-center text-[12px] leading-relaxed sm:text-left">
        {pending ? <p className={tone} role="status">Enviando foto…</p> : null}
        {validationError ? <p className="text-[#ffb26b]" role="alert">{validationError}</p> : null}
        {!validationError && result.error ? <p className="text-[#ffb26b]" role="alert">{result.error}</p> : null}
        {!validationError && result.ok ? <p className={tone} role="status">{result.ok}</p> : null}
        {!enabled ? <p className="text-muted">Fotos em configuração. A administração precisa ativar o armazenamento.</p> : null>
      </div>
      {filename ? <span className="sr-only">Arquivo selecionado: {filename}</span> : null}
    </form>
  );
}
