'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { friendlyError, type ActionState } from './errors';
import { VALIDATION_WITHOUT_CHECKOUT } from '@/lib/booking-mode';

export async function respondToInstructorOffer(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireRole(['instructor']);
  if (viewer.role !== 'instructor') return { error: 'Apenas o instrutor pode responder à oferta.' };
  const offer = z.uuid().safeParse(form.get('offerId'));
  const response = z.enum(['accept','decline']).safeParse(form.get('response'));
  if (!offer.success || !response.success) return { error: 'Solicitação inválida.' };
  const db = await createSupabaseServerClient();
  const { data, error } = response.data === 'accept'
    ? await db.rpc('accept_instructor_offer', { p_offer_id: offer.data })
    : await db.rpc('decline_instructor_offer', { p_offer_id: offer.data });
  if (error) {
    console.error('[offers.respond]', { code: error.code, message: error.message });
    return { error: friendlyError(error) };
  }
  revalidatePath('/instrutor/solicitacao');
  revalidatePath('/instrutor/hoje');
  revalidatePath('/instrutor/agenda');
  if (response.data === 'decline') return { ok: 'Oferta recusada. Sua posição na fila foi preservada.' };
  return typeof data === 'string' && z.uuid().safeParse(data).success
    ? { ok: VALIDATION_WITHOUT_CHECKOUT
      ? 'Oferta aceita. O aluno já pode confirmar a aula de validação, sem cobrança.'
      : 'Oferta aceita. Aguardando pagamento de teste pelo aluno.' }
    : { error: 'Oferta indisponível ou expirada. Atualize as solicitações.' };
}

export async function refreshInstructorRequest(requestId: string): Promise<ActionState> {
  const viewer = await requireRole(['student']);
  if (viewer.role !== 'student') return { error: 'Solicitação restrita ao aluno.' };
  const parsed = z.uuid().safeParse(requestId);
  if (!parsed.success) return { error: 'Solicitação inválida.' };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc('refresh_instructor_request', { p_request_id: parsed.data });
  if (error) {
    console.error('[offers.refresh]', { code: error.code, message: error.message });
    return { error: friendlyError(error) };
  }
  revalidatePath('/aluno/solicitacao/' + parsed.data);
  return {};
}
