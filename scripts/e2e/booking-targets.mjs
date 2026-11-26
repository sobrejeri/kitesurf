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
