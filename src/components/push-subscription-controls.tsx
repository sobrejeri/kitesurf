'use client';

import { useRef, useState } from 'react';
import { registerPushSubscription, revokePushSubscription } from '@/app/actions/push-subscriptions';
import { decodePushKey } from '@/lib/push-subscription';

export function PushSubscriptionControls() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  if (process.env.NEXT_PUBLIC_VENTO_PUSH_SUBSCRIPTIONS_ENABLED !== 'true') return null;

  async function enable() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    let created: PushSubscription | null = null;
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setMessage('Este navegador não permite ativar os avisos neste dispositivo.'); return;
      }
      const key = decodePushKey(process.env.NEXT_PUBLIC_VENTO_PUSH_VAPID_PUBLIC_KEY ?? '', 65);
      if (!key || key[0] !== 4) { setMessage('Os avisos neste dispositivo ainda não estão disponíveis.'); return; }
      // This call is reached only by the explicit activation button.
      if (await Notification.requestPermission() !== 'granted') { setMessage('Você pode permitir os avisos nas configurações do navegador.'); return; }
      const registration = await navigator.serviceWorker.ready;
      const previous = await registration.pushManager.getSubscription();
      // Never silently reuse a browser endpoint that may belong to another account.
      if (previous && !await previous.unsubscribe()) { setMessage('Não foi possível ativar os avisos. Tente novamente.'); return; }
      created = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(key).buffer });
      const result = await registerPushSubscription(created.toJSON());
      if (result.error) { await created.unsubscribe(); setMessage(result.error); return; }
      setMessage(result.ok ?? 'Avisos ativados neste dispositivo.');
    } catch {
      if (created) { try { await created.unsubscribe(); } catch { /* No persisted success is claimed. */ } }
      setMessage('Não foi possível ativar os avisos. Tente novamente.');
    } finally { inFlight.current = false; setBusy(false); }
  }

  async function disable() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) { setMessage('Não há avisos ativos neste navegador.'); return; }
      const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (!subscription) { setMessage('Não há avisos ativos neste navegador.'); return; }
      const result = await revokePushSubscription(subscription.endpoint);
      if (result.error) { setMessage(result.error); return; }
      await subscription.unsubscribe();
      setMessage(result.ok ?? 'Avisos desativados neste dispositivo.');
    } catch { setMessage('Não foi possível desativar os avisos. Tente novamente.'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <section aria-label="Avisos neste dispositivo" className="my-4 rounded-card border border-line bg-surface p-4">
    <h2 className="text-[15px] font-semibold text-ink">Avisos neste dispositivo</h2>
    <p className="mt-1 text-[13px] text-muted">Receba um aviso quando houver novidades na sua conta.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={enable} className="min-h-11 rounded-xl bg-brand px-4 text-[13px] font-semibold text-white disabled:opacity-50">Ativar avisos</button>
      <button type="button" disabled={busy} onClick={disable} className="min-h-11 rounded-xl border border-line px-4 text-[13px] font-semibold text-ink disabled:opacity-50">Desativar avisos</button>
    </div>
    <p role="status" aria-live="polite" className="mt-2 text-[13px] text-muted">{message}</p>
  </section>;
}
