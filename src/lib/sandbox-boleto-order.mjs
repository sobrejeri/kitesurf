/** Builds the standard Mercado Pago boleto order used for integration tests. */
export function buildSandboxBoletoOrder({ bookingReference, amountCents, payer }) {
  if (typeof bookingReference !== 'string' || !bookingReference.trim()) {
    throw new TypeError('A booking reference is required');
  }
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new RangeError('The server quote must be positive integer cents');
  }

  const cents = BigInt(amountCents);
  const amount = `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
  return {
    type: 'online',
    processing_mode: 'automatic',
    external_reference: bookingReference,
    total_amount: amount,
    payer: {
      email: payer.email,
      first_name: payer.first_name,
      last_name: payer.last_name,
      identification: {
        type: payer.identification.type,
        number: payer.identification.number,
      },
      address: {
        street_name: payer.address.street_name,
        street_number: payer.address.street_number,
        zip_code: payer.address.zip_code,
        neighborhood: payer.address.neighborhood,
        state: payer.address.state,
        city: payer.address.city,
      },
    },
    transactions: {
      payments: [{ amount, payment_method: { id: 'boleto', type: 'ticket' } }],
    },
  };
}
