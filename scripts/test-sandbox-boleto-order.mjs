import assert from 'node:assert/strict';
import { buildSandboxBoletoOrder } from '../src/lib/sandbox-boleto-order.mjs';

const payer = {
  email: 'aluno@example.com',
  first_name: 'Aluno',
  last_name: 'Teste',
  identification: { type: 'CPF', number: '99999999999' },
  address: {
    street_name: 'Rua de teste',
    street_number: 'S/N',
    zip_code: '62598000',
    neighborhood: 'Centro',
    state: 'CE',
    city: 'Jijoca de Jericoacoara',
  },
};
const input = { bookingReference: 'VNT-TEST', amountCents: 10001, payer };
assert.deepEqual(buildSandboxBoletoOrder(input), {
  type: 'online',
  processing_mode: 'automatic',
  external_reference: 'VNT-TEST',
  total_amount: '100.01',
  payer,
  transactions: {
    payments: [{ amount: '100.01', payment_method: { id: 'boleto', type: 'ticket' } }],
  },
});
assert.equal(buildSandboxBoletoOrder({ ...input, amountCents: 1 }).total_amount, '0.01');
assert.equal(buildSandboxBoletoOrder({ ...input, amountCents: Number.MAX_SAFE_INTEGER }).total_amount, '90071992547409.91');
for (const amountCents of [0, -1, 10.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
  assert.throws(() => buildSandboxBoletoOrder({ ...input, amountCents }), RangeError);
}
assert.throws(() => buildSandboxBoletoOrder({ ...input, bookingReference: '' }), TypeError);
console.log('Sandbox Mercado Pago boleto order payload passed');
