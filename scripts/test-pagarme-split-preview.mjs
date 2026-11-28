import assert from 'node:assert/strict';
import { previewPagarmeSplit } from '../src/lib/pagarme-split-preview.mjs';

const recipient = (recipientId, amountCents) => ({ recipientId, amountCents, liable: false, chargeProcessingFee: false, chargeRemainderFee: false });
const recipients = [recipient('rp_Plataforma', 6750), recipient('rp_Instrutor', 36000), recipient('rp_Afiliado', 2250)];
const result = previewPagarmeSplit({ totalCents: 45000, recipients });
assert.deepEqual(result.map(x => x.amount), [6750, 36000, 2250]);
assert.equal(result.reduce((sum, x) => sum + x.amount, 0), 45000);
assert.equal(result[0].type, 'flat');
assert.throws(() => previewPagarmeSplit({ totalCents: 45001, recipients }));
assert.throws(() => previewPagarmeSplit({ totalCents: 44999, recipients }));
assert.throws(() => previewPagarmeSplit({ totalCents: 45000, recipients: [recipients[0], recipients[0]] }));
assert.throws(() => previewPagarmeSplit({ totalCents: 1.5, recipients }));
assert.throws(() => previewPagarmeSplit({ totalCents: 1, recipients: [recipient('rp_A', -1)] }));
assert.throws(() => previewPagarmeSplit({ totalCents: 1, recipients: [{ recipientId: 'rp_A', amountCents: 1 }] }));
console.log('Pagar.me split preview: OK');
