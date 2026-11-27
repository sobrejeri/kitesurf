'use server';

import { requireRole } from '@/lib/auth';
import { PushEndpoint, PushSubscriptionInput } from '@/lib/push-subscription';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ActionState } from './errors';

export async function registerPushSubscription(input: unknown): Promise<ActionState> {
  if (process.env.NEXT_PUBLIC_VENTO_PUSH_SUBSCRIPTIONS_ENABLED !== 'true') return { error: 'Os avisos neste dispositivo ainda não estão disponíveis.' };
  await requireRole(['student', 'instructor', 'admin', 'partner']);
  const parsed = PushSubscriptionInput.safeParse(input);
  if (!parsed.success || (parsed.data.expirationTime != null && parsed.data.expirationTime <= Date.now())) return { error: 'Não foi possível ativar os avisos. Tente novamente.' };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc('register_my_push_subscription', {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
    p_expiration_time: parsed.data.expirationTime == null ? null : new Date(parsed.data.expirationTime).toISOString(),
  });
  if (error) return { error: 'Não foi possível ativar os avisos. Tente novamente.' };
  return { ok: 'Avisos ativados neste dispositivo.' };
}

// Revocation remains available even when registration has been disabled.
export async function revokePushSubscription(endpoint: unknown): Promise<ActionState> {
  await requireRole(['student', 'instructor', 'admin', 'partner']);
  const parsed = PushEndpoint.safeParse(endpoint);
  if (!parsed.success) return { error: 'Não foi possível desativar os avisos. Tente novamente.' };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc('revoke_my_push_subscription', { p_endpoint: parsed.data });
  if (error) return { error: 'Não foi possível desativar os avisos. Tente novamente.' };
  return { ok: 'Avisos desativados neste dispositivo.' };
}
