import 'server-only';
import { buildTestOrder } from './pagarme-test-order.mjs';

/** Prepared server transport, not connected to any route. The caller must
 * durably reserve a test attempt before calling, use the same stored request
 * key, and persist/reconcile the result. No automatic retries or state writes.
 * An injected transport is mandatory: importing this module cannot call a PSP.
 */
export async function submitTestOrder({ snapshot, method, secret, requestKey, send }) {
  const request = buildTestOrder(snapshot, method, secret);
  // Bind reconciliation to the values actually sent, not to a caller-owned
  // object that could change while the network request is in flight.
  const expectedBookingId = request.payload.code;
  const expectedAmountCents = request.payload.items[0].amount;
  const expectedCustomerId = request.payload.customer_id;
  if (typeof requestKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(requestKey)
      || typeof send !== 'function') throw new Error('Stored test attempt and transport required');
  try {
    const response = await send(request.endpoint, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}`,
        'Idempotency-Key': requestKey },
      body: JSON.stringify(request.payload),
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
