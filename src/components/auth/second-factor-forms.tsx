'use client';

import { useActionState } from 'react';

import { startSecondFactor, verifySecondFactor, type SecondFactorState } from '@/app/actions/second-factor';
import { CopyButton } from '@/components/affiliate/share-actions';
import { Icon } from '@/components/icon';
import { Button, Field, Note, inputClass } from '@/components/ui';
import { qrcodegen } from '@/vendor/qrcodegen';

/** The otpauth:// address as a QR Code, drawn here: the secret never leaves the page. */
function SecretQR({ uri }: { uri: string }) {
  const qr = qrcodegen.QrCode.encodeText(uri, qrcodegen.QrCode.Ecc.MEDIUM);
  const border = 4;
  const size = qr.size + border * 2;
  let path = '';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) path += `M${x + border} ${y + border}h1v1h-1z`;
    }
  }
  return (
    <div className="mx-auto w-fit rounded-[16px] bg-white p-3">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${size} ${size}`} className="h-[180px] w-[180px]"
        role="img" aria-label="QR Code para o app autenticador" shapeRendering="crispEdges">
        <rect width={size} height={size} fill="#fff" />
        <path d={path} fill="#0b1220" />
      </svg>
    </div>
  );
}

function Setup({ uri, secret }: { uri: string; secret: string }) {
  const grouped = secret.match(/.{1,4}/g)?.join(' ') ?? secret;
  return (
    <ol className="grid gap-4 text-[13px] text-label">
      <li>
        <strong className="block text-[14px] text-ink">1. Adicione a VentoKite no app autenticador</strong>
        No computador, escaneie o QR Code com o celular. No celular, toque em “Abrir no app autenticador”
        ou copie a chave.
        <div className="mt-3"><SecretQR uri={uri} /></div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <a href={uri} className="press inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line-ghost px-4 text-[13px] font-semibold text-brand">
            <Icon name="arrow" className="!h-4 !w-4" /> Abrir no app autenticador
          </a>
          <CopyButton value={secret} label="Copiar chave" copiedLabel="Chave copiada" variant="ghost" />
        </div>
        <p className="mt-2 break-all text-center font-mono text-[12px] text-muted">{grouped}</p>
      </li>
      <li>
        <strong className="block text-[14px] text-ink">2. Digite o código de 6 números que aparece no app</strong>
        Dica: cadastre também num segundo aparelho ou gerenciador de senhas. Sem o celular, só a equipe
        técnica consegue liberar o acesso.
      </li>
    </ol>
  );
}

export function SecondFactorForms({ factorId, next }: { factorId: string | null; next: string }) {
  const [setup, startAction, starting] = useActionState(startSecondFactor, {} as SecondFactorState);
  const [check, verifyAction, verifying] = useActionState(verifySecondFactor, {} as SecondFactorState);
  const activeFactor = factorId ?? setup.enrollment?.factorId ?? null;

  if (!activeFactor) {
    return (
      <div className="grid gap-4">
        <p className="text-[13px] leading-relaxed text-label">
          Para entrar na administração, além da senha você vai digitar um código de 6 números que muda a cada
          30 segundos, gerado por um app autenticador no celular: Google Authenticator, Microsoft Authenticator,
          1Password, Authy ou o app Senhas do iPhone.
        </p>
        {setup.error ? <Note tone="warning">{setup.error}</Note> : null}
        <form action={startAction}>
          <Button type="submit" disabled={starting} className="w-full">
            {starting ? 'Preparando…' : 'Configurar app autenticador'}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {setup.enrollment ? (
        <Setup uri={setup.enrollment.uri} secret={setup.enrollment.secret} />
      ) : (
        <p className="text-[13px] leading-relaxed text-label">
          Abra o app autenticador no celular e digite o código de 6 números da VentoKite.
        </p>
      )}
      <form action={verifyAction} className="grid gap-3">
        <input type="hidden" name="factorId" value={activeFactor} />
        <input type="hidden" name="next" value={next} />
        <Field label="Código de 6 números">
          <input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}"
            maxLength={7} autoFocus placeholder="000000"
            className={`${inputClass} text-center font-mono !text-[22px] tracking-[0.35em]`} />
        </Field>
        {check.error ? <Note tone="warning">{check.error}</Note> : null}
        <Button type="submit" disabled={verifying} className="w-full">
          {verifying ? 'Conferindo…' : 'Confirmar e entrar'}
        </Button>
      </form>
    </div>
  );
}
