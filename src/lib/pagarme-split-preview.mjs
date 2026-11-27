/** Offline preview only: never send this result to a gateway or use it for payouts.
 * Amounts must eventually come from an authorized, frozen booking snapshot. */
export function previewPagarmeSplit({ totalCents, recipients }) {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) throw new RangeError('Invalid total');
  if (!Array.isArray(recipients) || recipients.length === 0) throw new TypeError('Recipients required');
  const seen = new Set();
  let allocated = 0;
  const split = recipients.map(({ recipientId, amountCents, liable, chargeProcessingFee, chargeRemainderFee }) => {
    if (typeof recipientId !== 'string' || !/^rp_[A-Za-z0-9]+$/.test(recipientId) || seen.has(recipientId)) throw new TypeError('Invalid or duplicate recipient');
    seen.add(recipientId);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > totalCents - allocated) throw new RangeError('Invalid allocation');
    if ([liable, chargeProcessingFee, chargeRemainderFee].some(value => typeof value !== 'boolean')) throw new TypeError('Explicit fee and liability options required');
    allocated += amountCents;
    return { recipient_id: recipientId, type: 'flat', amount: amountCents, options: { liable, charge_processing_fee: chargeProcessingFee, charge_remainder_fee: chargeRemainderFee } };
  });
  if (allocated !== totalCents) throw new RangeError('Allocations must equal total');
  return split;
}
