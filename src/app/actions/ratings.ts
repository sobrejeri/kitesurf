'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { friendlyError, type ActionState } from './errors';

export async function rateInstructor(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireRole(['student']);
  if (viewer.role!=='student') return { error: 'Somente alunos podem avaliar aulas.' };
  const parsed = z.strictObject({
    bookingId: z.uuid(),
    stars: z.coerce.number().int().min(1).max(5),
    comment: z.string().trim().max(500),
  }).safeParse({
    bookingId: form.get('bookingId'),stars:form.get('stars'),comment:form.get('comment')??'',
  });
  if(!parsed.success) return {error:'Escolha de 1 a 5 estrelas e uma mensagem de até 500 caracteres.'};
  const db=await createSupabaseServerClient();
  const {error}=await db.rpc('rate_completed_booking',{
    p_booking_id:parsed.data.bookingId,
    p_stars:parsed.data.stars,
    p_comment:parsed.data.comment,
  });
  if(error) {
    console.error('[rating.create]',{code:error.code,message:error.message});
    return {error:friendlyError(error)};
  }
  revalidatePath('/aluno/reserva/'+parsed.data.bookingId);
  revalidatePath('/instrutor/avaliacoes');
  return {ok:'Avaliação registrada. Obrigado por compartilhar sua experiência!'};
}
