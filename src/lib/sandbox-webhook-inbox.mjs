import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Pure preflight for a durable webhook inbox. Caller MUST perform the insert
 * and fingerprint comparison in a single database transaction under a UNIQUE
 * (provider, eventId) constraint. This helper never acknowledges delivery.
 */
export function webhookInboxDecision({ provider, eventId, resourceId, eventType, existing = null }) {
  const fields = [provider, eventId, resourceId, eventType];
  if (!fields.every(v => typeof v === 'string' && /^[a-zA-Z0-9_.:-]{1,128}$/.test(v))) {
    return { action: 'reject', reason: 'invalid_identity' };
  }
  const fingerprint = createHash('sha256').update(JSON.stringify(fields)).digest('hex');
  if (existing === null) return { action: 'insert', fingerprint };
  if (typeof existing !== 'string' || !/^[0-9a-f]{64}$/.test(existing)) {
    return { action: 'reject', reason: 'invalid_existing_fingerprint' };
  }
  const same = timingSafeEqual(Buffer.from(existing, 'hex'), Buffer.from(fingerprint, 'hex'));
  return same ? { action: 'duplicate', fingerprint } : { action: 'reject', reason: 'event_id_collision' };
}
