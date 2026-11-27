import 'server-only';
import { createHash } from 'node:crypto';
import { buildTestOrder } from './pagarme-test-order.mjs';

const ENDPOINT = 'https://api.pagar.me/core/v5/orders';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  throw new Error('Unsupported test order value');
}
function hash(requestKey, endpoint, body) {
  return createHash('sha256').update(canonical({ version: 1, requestKey, endpoint, body })).digest('hex');
}

/** Prepare only from authorized, immutable test snapshots. Persist this exact
 * envelope atomically with the attempt before transport. It contains payer and
 * card identifiers: keep it server-side and out of logs. A hash is not proof
 * of authorization, test isolation, persistence or provider authenticity.
 */
export function prepareTestOrderEnvelope({ snapshot, method, secret, requestKey }) {
  if (typeof requestKey !== 'string' || !UUID.test(requestKey)) throw new Error('Stored test request key required');
  const request = buildTestOrder(snapshot, method, secret);
  const body = canonical(request.payload);
  return Object.freeze({ version: 1, requestKey, endpoint: request.endpoint, body,
    requestHash: hash(requestKey, request.endpoint, body) });
}

function valid(envelope) {
  if (!envelope || typeof envelope !== 'object' || Object.keys(envelope).length !== 5
      || envelope.version !== 1 || typeof envelope.requestKey !== 'string' || !UUID.test(envelope.requestKey)
      || envelope.endpoint !== ENDPOINT || typeof envelope.body !== 'string'
      || typeof envelope.requestHash !== 'string' || !/^[0-9a-f]{64}$/.test(envelope.requestHash)) return false;
  try {
    return canonical(JSON.parse(envelope.body)) === envelope.body
      && hash(envelope.requestKey, envelope.endpoint, envelope.body) === envelope.requestHash;
  } catch { return false; }
}

/** Refuse reuse of a request key for a different submitted body or destination.
 * Caller must perform this comparison under the same DB lock as reservation.
 */
export function matchesTestOrderEnvelope(stored, prepared) {
  return valid(stored) && valid(prepared)
    && stored.requestKey === prepared.requestKey && stored.endpoint === prepared.endpoint
    && stored.body === prepared.body && stored.requestHash === prepared.requestHash;
}
