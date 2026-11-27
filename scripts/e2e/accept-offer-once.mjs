import { requireUniqueTarget, requireUuid } from './unique-target.mjs';

// Only the student's current request can supply the accepted booking identity.
// A global toast cannot establish which request was accepted.
export async function bookingForRequest(page, base, requestId) {
  const id = requireUuid(requestId, 'solicitação');
  const expected = new URL(`/aluno/solicitacao/${id}`, base);
  const current = new URL(page.url());
  if (current.origin !== expected.origin || current.pathname !== expected.pathname) {
    throw new Error('página não corresponde à solicitação criada');
  }
  const links = page.getByRole('link', { name: 'Ver minha reserva', exact: true });
  if (await links.count() === 0) return null;
  const link = await requireUniqueTarget(links, 'reserva aceita da solicitação');
  const href = await link.getAttribute('href');
  if (!href) throw new Error('link da reserva sem destino');
  const target = new URL(href, base);
  const match = /^\/aluno\/reserva\/([^/]+)$/.exec(target.pathname);
  if (target.origin !== expected.origin || !match || target.search || target.hash) {
    throw new Error('destino de reserva inválido');
  }
  return { bookingId: requireUuid(match[1], 'reserva'), bookingUrl: target.href };
}

export async function verifyCheckpointBooking(page,base,checkpoint) {
  const requestId=requireUuid(checkpoint.requestId,'solicitação da retomada');
  await page.goto(new URL('/aluno/solicitacao/'+requestId,base).href,{waitUntil:'networkidle'});
  const accepted=await bookingForRequest(page,base,requestId);
  if(!accepted || accepted.bookingId!==checkpoint.bookingId) {
    throw Object.assign(new Error('solicitação não comprova a reserva do checkpoint'),{code:'E2E_BLOCKED'});
  }
  return {baseOrigin:new URL(page.url()).origin,requestId,bookingId:accepted.bookingId};
}

export async function acceptOfferOnce({
  findOffer, readAcceptedBooking, timeout = 100_000, confirmationTimeout = 60_000,
  every = 4000, now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  beforeClick = () => {},
}) {
  const poll = async (read, duration) => {
    const end = now() + duration;
    for (;;) {
      const value = await read();
      if (value) return value;
      if (now() >= end) return null;
      await sleep(Math.min(every, end - now()));
    }
  };
  const card = await poll(findOffer, timeout);
  if (!card) throw new Error('nenhuma oferta vinculada apareceu no prazo');
  const button = await requireUniqueTarget(card.getByRole('button', { name: 'Aceitar aula', exact: true }), 'botão de aceite');
  // Click is deliberately outside both read-only polling loops. A timeout or
  // lost response leaves an unknown result; neither is permission to click again.
  await beforeClick();
  await button.click();
  const booking = await poll(readAcceptedBooking, confirmationTimeout);
  if (!booking) throw new Error('resultado do aceite não confirmado; não repetir a gravação');
  return booking;
}

export async function presenceCodeForConfirmedBooking(page) {
  const voucher = await requireUniqueTarget(page.locator('.vento-voucher'), 'voucher da reserva');
  await (await requireUniqueTarget(voucher.getByText('Confirmada', { exact: true }), 'estado confirmado da reserva')).waitFor({ timeout: 20_000 });
  const codes = await voucher.locator('.vento-voucher-code').allTextContents();
  const normalized = codes.map((code) => code.trim());
  if (!normalized.length || normalized.some((code) => !/^\d{4}$/.test(code) || code !== normalized[0])) {
    throw new Error('códigos de presença ausentes, inválidos ou divergentes');
  }
  return normalized[0];
}

