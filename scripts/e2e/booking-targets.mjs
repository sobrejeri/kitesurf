import { requireUniqueTarget, requireUuid } from './unique-target.mjs';

// Busca apenas elementos visíveis ao perfil autenticado; nunca usa a posição na lista.
export async function offerForRequest(page, requestId, { allowAbsent = false } = {}) {
  const id = requireUuid(requestId, 'solicitação');
  const target = page.locator(`[data-request-id="${id}"]`);
  if (allowAbsent && await target.count() === 0) return null;
  return requireUniqueTarget(target, 'oferta da solicitação');
}

export async function meetingForBooking(page, bookingId, position) {
  const id = requireUuid(bookingId, 'reserva');
  if (!Number.isSafeInteger(position) || position < 1) throw new Error('posição do encontro inválida');
  return requireUniqueTarget(page.locator(`[data-booking-id="${id}"][data-meeting-position="${position}"]`), 'encontro da reserva');
}

// Capture both meeting identities before starting either one. Positions alone
// are insufficient if the page accidentally repeats the same meeting record.
export async function meetingIdsForBooking(page, bookingId, positions = [1, 2]) {
  if (!Array.isArray(positions) || positions.length < 2 || new Set(positions).size !== positions.length) {
    throw new Error('posições de encontros ausentes ou duplicadas');
  }
  const ids = {};
  for (const position of positions) {
    const card = await meetingForBooking(page, bookingId, position);
    const domId = await card.getAttribute('id');
    if (!domId?.startsWith('aula-')) throw new Error('encontro sem identificador no DOM');
    const id = requireUuid(domId.slice(5), 'encontro');
    if (Object.values(ids).includes(id)) throw new Error('mesmo encontro associado a posições diferentes');
    ids[position] = id;
  }
  return ids;
}
