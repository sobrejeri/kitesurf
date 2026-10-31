'use client';

import { useCallback, useEffect, useState } from 'react';

import { Icon } from './icon';

/** The version this page was loaded with, baked into the client bundle. */
const CURRENT = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';

/**
 * A floating "nova versão" prompt. It polls /version — on load, every few
 * minutes, and whenever the app comes back to the foreground (the usual way a
 * PWA is reopened) — and shows a card with an Atualizar button when the server
 * is running a newer build than this page.
 */
export function UpdatePrompt() {
  // The newest server id seen, and the one the user chose to dismiss.
  const [remote, setRemote] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    if (CURRENT === 'dev') return;
    let active = true;

    const check = async () => {
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { id?: string };
        if (active && data.id) setRemote(data.id);
      } catch {
        // Offline or a hiccup: just try again next time.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };

    void check();
    const timer = window.setInterval(() => void check(), 5 * 60 * 1000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', () => void check());
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const show = remote !== null && remote !== CURRENT && remote !== dismissed;

  const reload = useCallback(() => {
    // Give the service worker-less app a clean reload to the new assets.
    window.location.reload();
  }, []);

  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="theme-beach pointer-events-none fixed inset-x-0 bottom-[calc(90px+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 lg:bottom-6"
    >
      <div className="update-toast pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-surface/95 py-2 pl-3 pr-2 shadow-search backdrop-blur-xl">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-[#ff6a13]" aria-hidden="true">
          <Icon name="refresh" className="!h-5 !w-5" />
        </span>
        <span className="text-[13px] font-semibold text-ink">Nova versão disponível</span>
        <button
          type="button"
          onClick={reload}
          className="btn-primary press rounded-full px-4 py-2 !text-[13px] font-bold text-white"
        >
          Atualizar
        </button>
        <button
          type="button"
          onClick={() => setDismissed(remote)}
          aria-label="Agora não"
          className="press grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted"
        >
          <Icon name="plus" className="!h-5 !w-5 rotate-45" />
        </button>
      </div>
    </div>
  );
}
