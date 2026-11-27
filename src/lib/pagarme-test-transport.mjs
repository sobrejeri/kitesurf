import 'server-only';
import { isValidTestOrderEnvelope } from './pagarme-test-request-envelope.mjs';

/** Prepared server transport, not connected to any route. The caller must
 * durably reserve a test attempt before calling, use the same stored request
 * key, and persist/reconcile the result. No automatic retries or state writes.
 * An injected transport is mandatory: importing this module cannot call a PSP.
 */
export async function submitTestOrder({ envelope, secret, send }) {
  if (typeof secret !== 'string' || !/^sk_test_[A-Za-z0-9]+$/.test(secret)) throw new Error('Pagar.me test key required');
  // Copy primitive fields once; all validation, network and response checks
  // use this copy, never a caller-owned object after I/O begins.
  const request = envelope && { ...envelope };
  if (!isValidTestOrderEnvelope(request) || typeof send !== 'function') throw new Error('Valid stored test envelope and transport required');
  const payload = JSON.parse(request.body);
  const expectedBookingId = payload?.code;
  const expectedAmountCents = payload?.items?.[0]?.amount;
  const expectedCustomerId = payload?.customer_id;
  if (typeof expectedBookingId !== 'string' || typeof expectedCustomerId !== 'string'
      || !Number.isSafeInteger(expectedAmountCents) || expectedAmountCents < 1) throw new Error('Invalid test order body');
  try {
    const response = await send(request.endpoint, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}`,
        'Idempotency-Key': request.requestKey },
      body: request.body,
    });
    if (!response.ok) return { kind: 'unknown' };
    const data = await response.json();
    if (!data || typeof data.id !== 'string' || !/^or_[A-Za-z0-9]+$/.test(data.id)
        || data.code !== expectedBookingId || data.amount !== expectedAmountCents || data.currency !== 'BRL'
        || data.customer?.id !== expectedCustomerId || typeof data.status !== 'string'
        || !['pending', 'paid', 'canceled', 'failed'].includes(data.status.toLowerCase())) return { kind: 'unknown' };
    // This is an observation, not authorization to confirm a booking or payout.
    return { kind: 'observed', orderId: data.id, providerStatus: data.status.toLowerCase() };
  } catch {
    // Do not leak credentials/provider payloads or blindly retry an uncertain request.
    return { kind: 'unknown' };
  }
}
