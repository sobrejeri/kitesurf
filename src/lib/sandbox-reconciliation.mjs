/** Read-only reconciliation of synthetic sandbox payments; never releases payouts. */
const METHODS = new Set(['pix', 'card', 'boleto']);
const STATUSES = new Set(['pending', 'approved', 'expired', 'declined', 'refunded']);
function cents(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(name + ' must be nonnegative integer cents');
  return value;
}
export function reconcileSandboxPayments(payments) {
  if (!Array.isArray(payments)) throw new TypeError('payments must be an array');
  const ids = new Set();
  const totals = { count: 0, approvedCents: 0, pendingCents: 0, refundedCents: 0, declinedCount: 0, expiredCount: 0, payoutReleasedCents: 0 };
  const rows = [];
  for (const p of payments) {
    if (!p || typeof p.paymentId !== 'string' || !p.paymentId.trim() || ids.has(p.paymentId)) throw new RangeError('missing or duplicate payment id');
    ids.add(p.paymentId);
    if (!METHODS.has(p.method) || !STATUSES.has(p.status)) throw new RangeError('unsupported payment method or status');
    if ((p.method !== 'card' && p.status === 'declined') || (p.method === 'card' && p.status === 'expired')) throw new RangeError('inconsistent payment status');
    if (p.payoutStatus !== 'not_started') throw new RangeError('sandbox payout must remain disabled');
    const gross = cents(p.grossCents, 'grossCents');
    const refund = cents(p.refundedCents ?? 0, 'refundedCents');
    if (refund > gross || (refund && !['approved','refunded'].includes(p.status)) || (p.status === 'refunded' && refund !== gross)) throw new RangeError('inconsistent refund');
    const approved = ['approved','refunded'].includes(p.status) ? gross : 0;
    const pending = p.status === 'pending' ? gross : 0;
    for (const [key, amount] of [['approvedCents',approved],['pendingCents',pending],['refundedCents',refund]]) {
      const next = totals[key] + amount;
      if (!Number.isSafeInteger(next)) throw new RangeError('totals overflow');
      totals[key] = next;
    }
    totals.count++;
    if (p.status === 'declined') totals.declinedCount++;
    if (p.status === 'expired') totals.expiredCount++;
    rows.push({ paymentId: p.paymentId, method: p.method, status: p.status, grossCents: gross, refundedCents: refund, netApprovedCents: approved - refund, payoutStatus: 'not_started' });
  }
  return { totals: { ...totals, netApprovedCents: totals.approvedCents - totals.refundedCents }, rows };
}
