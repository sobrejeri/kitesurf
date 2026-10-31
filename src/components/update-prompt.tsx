'use client';

import { useCallback, useEffect, useState } from 'react';

import { Icon } from './icon';

/** Compiled into each release by next.config.mjs. */
const CURRENT = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';
const LAST_SEEN_KEY = 'vento:last-seen-build';
const DISMISSED_KEY = 'vento:dismissed-build';

function storedValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private browsing / storage restrictions must never break the app.
    return null;
  }
}

function remember(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Still allow reload and dismissal without persistent storage.
  }
}

/**
 * Identifies new releases even when iOS Safari starts the app with the NEW
 * bundle already loaded. Previously the banner only compared remote with the
 * currently running JS, so it disappeared silently on a fresh launch.
 *
 * A first launch also gets one unobtrusive "Vento atualizado" acknowledgment,
 * establishing the stored baseline for all future deployments.
 */
export function UpdatePrompt() {
  const [remote, setRemote] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    setLastSeen(storedValue(LAST_SEEN_KEY));
    setDismissed(storedValue(DISMISSED_KEY));
    setReady(true);

    const check = async () => {
      // The dynamic route bypasses stale static files and browser caches.
      // Keep version.json as a fallback for older Render deployments.
      for (const endpoint of ['/api/version', '/version.json']) {
        try {
          const url = `${endpoint}?t=${Date.now()}`;
          const response = await fetch(url, { cache: 'no-store' });
          if (!response.ok) continue;
          const json = (await response.json()) as { id?: unknown };
          if (typeof json.id === 'string' && json.id.length > 0 && json.id !== 'dev') {
            if (active) setRemote(json.id);
            return;
          }
        } catch {
          // Try the fallback if the endpoint is unreachable.
        }
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const onFocus = () => void check();

    void check();
    const timer = window.setInterval(() => void check(), 3 * 60 * 1000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const show = ready && remote !== null && remote !== dismissed &&
    (remote !== CURRENT || lastSeen !== remote);
  const needsReload = remote !== null && remote !== CURRENT;

  const acknowledge = useCallback(() => {
    if (!remote) return;
    remember(LAST_SEEN_KEY, remote);
    setLastSeen(remote);
    setDismissed(null);

    if (needsReload) {
      // A changing URL also bypasses old iOS Safari page caches.
      const url = new URL(window.location.href);
      url.searchParams.set('vento_build', remote.slice(0, 12));
      window.location.replace(url.toString());
    }
  }, [remote, needsReload]);

  const dismiss = useCallback(() => {
    if (!remote) return;
    remember(DISMISSED_KEY, remote);
    setDismissed(remote);
  }, [remote]);

  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="theme-beach pointer-events-none fixed inset-x-0 bottom-[calc(90px+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 lg:bottom-6"
    >
      <div className="update-toast pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-surface/95 py-2 pl-3 pr-2 shadow-search backdrop-blur-xl">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand" aria-hidden="true">
          <Icon name="refresh" className="!h-5 !w-5" />
        </span>
        <span className="text-[13px] font-semibold text-ink">
          {needsReload ? 'Nova versão disponível' : 'Vento atualizado'}
        </span>
        <button
          type="button"
          onClick={acknowledge}
          className="btn-primary press rounded-full px-4 py-2 !text-[13px] font-bold text-on-brand"
        >
          {needsReload ? 'Atualizar' : 'Entendi'}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Agora não"
          className="press grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted"
        >
          <Icon name="plus" className="!h-5 !w-5 rotate-45" />
        </button>
      </div>
    </div>
  );
}
