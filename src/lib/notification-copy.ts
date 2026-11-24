type OfferNotice = { category: string; title: string; body: string; href: string };

/** Historical and new accepted-offer alerts use the same database text.
 * Adapt only that exact system notice while checkout is disabled. */
export function notificationBody(notice: OfferNotice, validationWithoutCheckout: boolean): string {
  if (validationWithoutCheckout
    && notice.category === 'offer'
    && notice.title === 'Instrutor aceitou a aula'
    && notice.body === 'Sua solicitação foi aceita. Acesse para continuar o pagamento.'
    && /^\/aluno\/solicitacao\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(notice.href)) {
    return 'Sua solicitação foi aceita. Acesse a reserva para confirmar a aula de validação, sem cobrança.';
  }
  return notice.body;
}
