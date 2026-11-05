'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import { friendlyError, type ActionState } from './errors';

const UUID = z.uuid();
const LocalDateTime = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/,
);

function refreshBalanceViews(bookingId: string) {
  revalidatePath('/aluno/reserva/' + bookingId);
  revalidatePath('/aluno/aulas');
  revalidatePath('/aluno/evolucao');
  revalidatePath('/aluno/inicio');
  revalidatePath('/instrutor/agenda');
  revalidatePath('/instrutor/aula');
}

/** Request a make-up lesson against minutes already contracted, never a new sale. */
export async function requestBookingBalance(
  _previous: ActionState, form: FormData,
): Promise<ActionState> {
  await requireRole(['student']);
  const parsed = z.strictObject({
    bookingId: UUID,
    proposedDate: LocalDateTime,
    minutes: z.coerce.number().int().min(1).max(480),
  }).safeParse({
    bookingId: form.get('bookingId'),
    proposedDate: form.get('proposedDate'),
    minutes: form.get('minutes'),
  });
  if (!parsed.success) return { error: 'Informe data, horário e os minutos disponíveis.' };
  const timestamp = parsed.data.proposedDate + ':00-03:00';
  const epoch = Date.parse(timestamp);
  if (!Number.isFinite(epoch) || epoch < Date.now() + 72 * 3600000 ||
      epoch > Date.now() + 90 * 86400000) {
    return { error: 'Escolha uma data entre 72 horas e 90 dias a partir de agora.' };
  }
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc('request_booking_balance', {
    p_booking_id: parsed.data.bookingId,
    p_start: timestamp,
    p_minutes: parsed.data.minutes,
  });
  if (error) {
    console.error('[booking.balance.request]', { code: error.code, message: error.message });
    return { error: friendlyError(error) };
  }
  refreshBalanceViews(parsed.data.bookingId);
  return { ok: 'Pedido enviado ao seu instrutor. Ele tem 12 horas para responder; não haverá nova cobrança.' };
}

/** Only the already-assigned instructor can approve the make-up time. */
export async function respondBookingBalance(
  _previous: ActionState, form: FormData,
): Promise<ActionState> {
  await requireRole(['instructor']);
  const parsed = z.strictObject({
    bookingId: UUID,
    requestId: UUID,
    decision: z.enum(['accept', 'reject']),
  }).safeParse({
    bookingId: form.get('bookingId'),
    requestId: form.get('requestId'),
    decision: form.get('decision'),
  });
  if (!parsed.success) return { error: 'Resposta inválida. Reabra a agenda e tente novamente.' };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc('respond_booking_balance', {
    p_request_id: parsed.data.requestId,
    p_accept: parsed.data.decision === 'accept',
  });
  if (error) {
    console.error('[booking.balance.respond]', { code: error.code, message: error.message });
    return { error: friendlyError(error) };
  }
  refreshBalanceViews(parsed.data.bookingId);
  return { ok: parsed.data.decision === 'accept'
    ? 'Reposição confirmada. O encontro foi acrescentado à agenda, sem nova cobrança.'
    : 'Pedido recusado. O aluno pode escolher outro horário para o saldo restante.' };
}
