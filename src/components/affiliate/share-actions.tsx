'use client';

import { useState } from 'react';

import { Icon } from '@/components/icon';
import { buttonClass } from '@/components/ui';

/** Copies a text (link or ready message) and confirms in place. */
/** Light outline for buttons that sit on the dark navy cards. */
const ON_DARK = '!border-[#ffffff33] !bg-transparent !text-white hover:!bg-[#ffffff14]';

export function CopyButton({
  value,
  label = 'Copiar',
  copiedLabel = 'Copiado',
  variant = 'primary',
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  variant?: 'primary' | 'ghost' | 'onDark';
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2400);
        });
      }}
      className={variant === 'onDark' ? buttonClass('ghost', 'sm', `!min-h-10 ${ON_DARK}`) : buttonClass(variant, 'sm', '!min-h-10')}
    >
      <Icon name={copied ? 'check' : 'link'} className="!h-4 !w-4" />
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
}

/**
 * Opens the phone's share sheet (WhatsApp, Instagram, e-mail…). Where the
 * browser has no share sheet, it copies the link instead.
 */
export function ShareButton({ url, text, title = 'VentoKite', onDark = false }: { url: string; text: string; title?: string; onDark?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (navigator.share) {
          try {
            await navigator.share({ title, text, url });
            return;
          } catch {
            // Cancelled by the person: nothing else to do.
            return;
          }
        }
        await navigator.clipboard?.writeText(`${text} ${url}`);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2400);
      }}
      className={buttonClass('ghost', 'sm', onDark ? `!min-h-10 ${ON_DARK}` : '!min-h-10')}
    >
      <Icon name={copied ? 'check' : 'arrow'} className="!h-4 !w-4" />
      <span aria-live="polite">{copied ? 'Copiado para enviar' : 'Compartilhar'}</span>
    </button>
  );
}
