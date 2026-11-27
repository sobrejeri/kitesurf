import { z } from 'zod';

// Only known browser push services. No arbitrary HTTPS destination may become
// a future privileged sender's egress target (including credentials/ports/IPs).
export const PUSH_ENDPOINT = /^https:\/\/(?:fcm\.googleapis\.com|(?:[a-z0-9-]+\.)?push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\/[A-Za-z0-9_~.!$&'()*+,;=:@%/?-]+$/;

export function decodePushKey(value: string, size: number): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
    if (binary.length !== size || btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== value) return null;
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch { return null; }
}

export const PushEndpoint = z.string().max(2048).regex(PUSH_ENDPOINT).refine(value => {
  try { return new URL(value).href === value; } catch { return false; }
});
export const PushSubscriptionInput = z.strictObject({
  endpoint: PushEndpoint,
  expirationTime: z.number().int().min(1).max(253402300799999).nullable().optional(),
  keys: z.strictObject({
    p256dh: z.string().length(87).refine(value => decodePushKey(value, 65)?.[0] === 4),
    auth: z.string().length(22).refine(value => decodePushKey(value, 16) !== null),
  }),
});
