/**
 * Offline contract for the official Pagar.me test checkout. No credentials,
 * network calls, booking writes or settlement decisions live in this module.
 * Only server-verified immutable booking snapshots may be passed by a caller.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TEST_ENDPOINT = 'https://sdx-api.pagar.me/core/v5/paymentlinks';
const CHECKOUT_HOSTS = new Set(['payment-link.pagar.me', 'checkout.pagar.me']);

export function createTestCheckoutRequest(snapshot, secret) {
  if (typeof secret !== 'string' || !/^sk_test_[A-Za-z0-9]+$/.test(secret)) throw new Error('Pagar.me test key required');
  if (!snapshot || typeof snapshot.bookingId !== 'string' || !UUID.test(snapshot.bookingId)
      || !Number.isSafeInteger(snapshot.amountCents) || snapshot.amountCents < 1 || snapshot.amountCents > 100000000) {
    throw new Error('Invalid booking snapshot');
  }
  const amount = snapshot.amountCents;
  return {
    endpoint: TEST_ENDPOINT,
    // Keep the secret out of the returned object and logs; transport code must
    // apply Basic auth on the server, immediately before the request.
    payload: {
      type: 'order', name: `VentoKite teste ${snapshot.bookingId}`,
      order_code: snapshot.bookingId, max_paid_sessions: 1,
      payment_settings: {
        accepted_payment_methods: ['credit_card'],
        credit_card_settings: { operation_type: 'auth_and_capture', installments: [{ number: 1, total: amount }] },
      },
      cart_settings: { items: [{ name: 'Aula VentoKite - TESTE', amount, default_quantity: 1 }] },
    },
  };
}

/** A URL never proves payment; validate provider events and reconcile separately. */
export function parseTestCheckoutResponse(value) {
  if (!value || typeof value.id !== 'string' || !/^pl_[A-Za-z0-9]+$/.test(value.id)
      || typeof value.url !== 'string' || value.status !== 'active') throw new Error('Invalid checkout response');
  let url;
  try { url = new URL(value.url); } catch { throw new Error('Invalid checkout response'); }
  if (url.protocol !== 'https:' || !CHECKOUT_HOSTS.has(url.hostname) || url.port || url.username || url.password
      || url.pathname !== `/${value.id}` || url.search || url.hash) throw new Error('Invalid checkout response');
  return { id: value.id, url: url.href };
}
