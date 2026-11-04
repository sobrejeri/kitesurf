'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { friendlyError, type ActionState } from './errors';

const Message = z.strictObject({
  bookingId: z.uuid(),
  body: z.string().trim().min(1).max(2000),
});

export async function sendBookingMessage(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireRole(['student', 'instructor']);
  if (viewer.role !== 'student' && viewer.role !== 'instructor') {
    return { error: 'Somente alunos e instrutores podem enviar mensagens.' };
  }
  const parsed = Message.safeParse({ bookingId: form.get('bookingId'), body: form.get('body') });
  if (!parsed.success) return { error: 'Escreva uma mensagem com até 2.000 caracteres.' };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc('send_booking_message', {
    p_booking_id: parsed.data.bookingId, p_body: parsed.data.body,
  });
  if (error) {
    console.error('[booking.chat] send failed', { code: error.code, message: error.message });
    return { error: friendlyError(error) };
  }
  revalidatePath('/aluno/atendimento/' + parsed.data.bookingId);
  revalidatePath('/instrutor/atendimento/' + parsed.data.bookingId);
  return { ok: 'Mensagem enviada. A conversa atualiza automaticamente.' };
}
