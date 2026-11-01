'use client';

import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ChangeEvent } from 'react';

import { preparePartnerAvatarUpload, registerPartnerAvatarUpload } from '@/app/actions/partner-profile';
import { Icon } from '@/components/icon';

const MAX_SIZE = 3 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

function validImageHeader(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'image/jpeg') return bytes.length >= 3 &&
    bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === 'image/png') return bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value);
  return bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
}

/**
 * Mobile-friendly avatar upload: small authenticated actions authorize and
 * verify the operation, while image bytes go directly from the device to the
 * private Supabase bucket. No image goes through a Next Server Action body.
 */
export function PartnerAvatarUploader({
  photoUrl, name, enabled = true,
}: {
  photoUrl: string | null;
  name: string;
  enabled?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'uploading' | 'verifying'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const busy = phase !== 'idle';

  function choosePhoto() {
    if (!enabled || busy) return;
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  }

  async function confirm(path: string) {
    setPhase('verifying');
    const result = await registerPartnerAvatarUpload({ path });
    if (result.error) {
      setError(result.error);
      return;
    }
    setUploadedPath(null);
    setError(null);
    setNotice(result.ok ?? 'Foto da pousada atualizada.');
    router.refresh();
  }

  async function upload(file: File) {
    if (busy || !enabled) return;
    setError(null);
    setNotice(null);
    setUploadedPath(null);

    if (!ACCEPTED.includes(file.type)) {
      setError('Selecione uma imagem JPG, PNG ou WebP. Fotos HEIC precisam ser convertidas.');
      return;
    }
    if (file.size === 0 || file.size > MAX_SIZE) {
      setError('A foto precisa ter até 3 MB e não pode estar vazia.');
      return;
    }

    try {
      const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      if (!validImageHeader(header, file.type)) {
        setError('O arquivo selecionado não corresponde ao formato da imagem.');
        return;
      }

      setPhase('preparing');
      const ticket = await preparePartnerAvatarUpload({ mime: file.type, size: file.size });
      if (ticket.error || !ticket.path || !ticket.token) {
        setError(ticket.error ?? 'Não foi possível autorizar o envio da foto.');
        return;
      }

      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !anonKey) {
        setError('Configuração do armazenamento indisponível. Avise a administração.');
        return;
      }

      const storage = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }).storage.from('vento-partner-avatars');

      setPhase('uploading');
      const { error: uploadError } = await storage.uploadToSignedUrl(
        ticket.path, ticket.token, file,
        { contentType: file.type, cacheControl: '60' },
      );
      if (uploadError) {
        console.error('[partner.avatar.client.upload]', {
          status: uploadError.statusCode, message: uploadError.message,
        });
        setError('Falha no envio ao armazenamento. Verifique a conexão e tente novamente.');
        return;
      }

      // Keep the already uploaded path if the final small server request fails.
      // The user can retry confirmation without transferring their photo again.
      setUploadedPath(ticket.path);
      await confirm(ticket.path);
    } catch (cause) {
      console.error('[partner.avatar.client.unexpected]', cause);
      setError('Não foi possível concluir o envio. Verifique sua conexão e tente novamente.');
    } finally {
      setPhase('idle');
    }
  }

  async function retryConfirmation() {
    if (!uploadedPath || busy) return;
    setError(null);
    try {
      await confirm(uploadedPath);
    } catch (cause) {
      console.error('[partner.avatar.client.retry]', cause);
      setError('A confirmação não foi concluída. Tente novamente sem reenviar a foto.');
    } finally {
      setPhase('idle');
    }
  }

  function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (file) void upload(file);
  }

  const phaseText = {
    idle: '',
    preparing: 'Preparando envio…',
    uploading: 'Enviando foto…',
    verifying: 'Confirmando foto…',
  }[phase];

  return (
    <div className="flex min-w-0 flex-col items-center sm:items-start">
      <input
        ref={inputRef}
        type="file"
        name="avatar"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label="Selecionar foto de perfil"
        onChange={onFileChosen}
        disabled={!enabled || busy}
      />
      <div className="relative h-[118px] w-[118px] shrink-0">
        <div className="absolute inset-0 overflow-hidden rounded-full border-2 border-white/20 bg-[#173148] ring-2 ring-[#ff861e]/20">
          {photoUrl ? <img src={photoUrl} alt={'Foto de perfil de ' + name} className="h-full w-full object-cover" /> : null}
        </div>
        {photoUrl ? (
          <button type="button" aria-label="Atualizar foto de perfil" title="Atualizar foto"
            onClick={choosePhoto} disabled={busy || !enabled}
            className="press absolute -bottom-0.5 -right-1 grid h-[44px] w-[44px] place-items-center rounded-full border-[4px] border-[#07182b] bg-white text-[#14253b] shadow-lg disabled:opacity-60">
            <Icon name="plus" className="!h-5 !w-5" />
          </button>
        ) : (
          <button type="button" aria-label="Adicionar foto de perfil" title="Adicionar foto"
            onClick={choosePhoto} disabled={busy || !enabled}
            className="press absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full border-2 border-dashed border-white/30 bg-[#112e44] text-[#ff861e] disabled:opacity-60">
            <Icon name="plus" className="!h-8 !w-8" />
            <span className="px-2 text-[11px] font-semibold leading-tight text-white">Adicionar foto</span>
          </button>
        )}
      </div>
      <div aria-live="polite" className="mt-2 max-w-[280px] text-center text-[12px] leading-relaxed sm:text-left">
        {busy ? <p role="status" className="text-[#ff861e]">{phaseText}</p> : null}
        {error ? <p role="alert" className="text-[#ffb26b]">{error}</p> : null}
        {notice ? <p role="status" className="text-[#ff861e]">{notice}</p> : null}
        {!enabled ? <p className="text-muted">Fotos indisponíveis. Confira a migração 22 e o bucket privado.</p> : null}
        {uploadedPath && !busy ? (
          <button type="button" onClick={() => void retryConfirmation()}
            className="mt-2 min-h-11 rounded-full border border-[#ff861e] px-3 text-[12px] font-semibold text-[#ff861e]">
            Confirmar foto sem reenviar
          </button>
        ) : null}
      </div>
    </div>
  );
}
