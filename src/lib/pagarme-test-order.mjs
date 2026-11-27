/** Offline request contract. A caller must provide authorized server snapshots;
 * no PSP request, credential storage, booking mutation or payout occurs here. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const identifier = (value, prefix) => typeof value === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value);

export function buildTestOrder(snapshot, method, secret) {
  if (typeof secret !== 'string' || !/^sk_test_[A-Za-z0-9]+$/.test(secret)) throw new Error('Pagar.me test key required');
  if (!snapshot || typeof snapshot.bookingId !== 'string' || !UUID.test(snapshot.bookingId)
      || !Number.isSafeInteger(snapshot.amountCents) || snapshot.amountCents < 1 || snapshot.amountCents > 100000000
      || !identifier(snapshot.customerId, 'cus')) throw new Error('Invalid booking snapshot');
  if (!Array.isArray(snapshot.splits) || !snapshot.splits.length || snapshot.splits.length > 20) throw new Error('Invalid split');
  const ids = new Set(); let total = 0;
  const split = snapshot.splits.map(item => {
    if (!item || !identifier(item.recipientId, 'rp') || ids.has(item.recipientId)
        || !Number.isSafeInteger(item.cents) || item.cents < 1
        || typeof item.liable !== 'boolean' || typeof item.chargeProcessingFee !== 'boolean'
        || typeof item.chargeRemainderFee !== 'boolean') throw new Error('Invalid split');
    ids.add(item.recipientId); total += item.cents;
    if (!Number.isSafeInteger(total)) throw new Error('Invalid split');
    return { type: 'flat', amount: item.cents, recipient_id: item.recipientId,
      options: { liable: item.liable, charge_processing_fee: item.chargeProcessingFee, charge_remainder_fee: item.chargeRemainderFee } };
  });
  if (total !== snapshot.amountCents) throw new Error('Invalid split total');
  let payment;
  if (method?.type === 'pix' && Object.keys(method).length === 1) payment = { payment_method: 'pix', pix: { expires_in: 1800 }, split };
  else if (method?.type === 'credit_card' && Object.keys(method).length === 2 && identifier(method.cardId, 'card')) {
    payment = { payment_method: 'credit_card', credit_card: { card_id: method.cardId, installments: 1, operation_type: 'auth_and_capture' }, split };
  } else throw new Error('Invalid test payment method');
  return { endpoint: 'https://api.pagar.me/core/v5/orders', payload: {
    code: snapshot.bookingId, customer_id: snapshot.customerId,
    items: [{ amount: snapshot.amountCents, description: 'Aula VentoKite - TESTE', quantity: 1 }],
    payments: [payment],
  } };
}
