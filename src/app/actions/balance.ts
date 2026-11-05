'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { friendlyError, type ActionState } from './errors';

const UUID = z.uuid();
// Local date and time in Ceará, as the make-up date picker emits it.
const ProposedDate = z.string().regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/);

function refreshBalanceViews(bookingId?: string) {
  revalidatePath('/aluno/aulas');
  revalidatePath('/aluno/inicio');
  revalidatePath('/aluno/evolucao');
  revalidatePath('/instrutor/aula');
  revalidatePath('/instrutor/hoje');
  if (bookingId) revalidatePath('/aluno/reserva/' + bookingId);
}

/** Student proposes a make-up lesson for the booking's remaining paid balance. */
export async function requestBalanceMeeting(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['student']);
  const parsed = z.strictObject({
    bookingId: UUID,
    proposedDate: ProposedDate,
    minutes: z.coerce.number().int().min(1).max(480),
  }).safeParse({
    bookingId: form.get('bookingId'),
    proposedDate: form.get('proposedDate'),
    minutes: form.get('minutes'),
  });
  if (!parsed.success) return { error: 'Escolha a data, o horário e os minutos do saldo.' };

  // Ceará local time is always -03:00; no browser-dependent timezone parsing.
  const startsAt = parsed.data.proposedDate + ':00-03:00';
  const epoch = Date.parse(startsAt);
  if (!Number.isFinite(epoch) || epoch < Date.now() + 72 * 60 * 60 * 1000) {
    return { error: 'A aula de reposição precisa começar daqui a pelo menos 72 horas.' };
  }

  const db = await createSupabaseServerClient();
  const { error } = await db.rpc('request_balance_meeting', {
    p_booking_id: parsed.data.bookingId,
    p_starts_at: startsAt,
    p_minutes: parsed.data.minutes,
  });
  if (error) {
    console.error('[balance.request]', { code: error.code, message: error.message });
    return { error: friendlyError(error) };
  }
  refreshBalanceViews(parsed.data.bookingId);
  return { ok: 'Pedido enviado! O instrutor tem 48 horas para confirmar. Nenhuma cobrança é feita.' };
}

/** The assigned instructor confirms or declines the make-up lesson. */
export async function respondBalanceMeeting(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['instructor']);
  const parsed = z.strictObject({
    requestId: UUID,
    bookingId: UUID,
    decision: z.enum(['accept', 'reject']),
  }).safeParse({
    requestId: form.get('requestId'),
    bookingId: form.get('bookingId'),
    decision: form.get('decision'),
  });
  if (!parsed.success) return { error: 'Escolha aceitar ou recusar a aula de reposição.' };

  const db = await createSupabaseServerClient();
  const { error } = await db.rpc('respond_balance_meeting', {
    p_request_id: parsed.data.requestId,
    p_accept: parsed.data.decision === 'accept',
  });
  if (error) {
    console.error('[balance.respond]', { code: error.code, message: error.message });
    return { error: friendlyError(error) };
  }
  refreshBalanceViews(parsed.data.bookingId);
  return {
    ok: parsed.data.decision === 'accept'
      ? 'Aula de reposição confirmada! Ela já aparece na sua agenda.'
      : 'Aula de reposição recusada. O saldo do aluno continua disponível.',
  };
}

/** Student forfeits a leftover balance too small to use, finalising the booking. */
export async function closeBookingBalance(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['student']);
  const id = UUID.safeParse(form.get('bookingId'));
  if (!id.success) return { error: 'Reserva inválida.' };

  const db = await createSupabaseServerClient();
  const { error } = await db.rpc('close_booking_balance', { p_booking_id: id.data });
  if (error) {
    console.error('[balance.close]', { code: error.code, message: error.message });
    return { error: friendlyError(error) };
  }
  refreshBalanceViews(id.data);
  return { ok: 'Reserva encerrada. Consulte o suporte sobre qualquer valor pago não utilizado.' };
}
