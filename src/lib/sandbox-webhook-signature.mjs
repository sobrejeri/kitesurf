import { createHmac, timingSafeEqual } from 'node:crypto';

/** Verify Mercado Pago's documented x-signature manifest. No payment side effects. */
export function verifySandboxWebhookSignature({ signature, requestId, dataId, secret, nowMs = Date.now(), maxAgeMs = 300_000 }) {
  if (![signature, requestId, dataId, secret].every(v => typeof v === 'string' && v.length > 0)) return false;
  if (!Number.isSafeInteger(nowMs) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 0) return false;
  const parts = Object.create(null);
  for (const part of signature.split(',')) {
    const index = part.indexOf('=');
    if (index <= 0) return false;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!['ts', 'v1'].includes(key) || Object.hasOwn(parts, key) || !value) return false;
    parts[key] = value;
  }
  if (!/^[0-9]+$/.test(parts.ts ?? '') || !/^[a-f0-9]{64}$/i.test(parts.v1 ?? '')) return false;
  const timestamp = Number(parts.ts);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowMs - timestamp) > maxAgeMs) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest();
  const received = Buffer.from(parts.v1, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}
