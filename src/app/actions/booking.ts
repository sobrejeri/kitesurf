'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { LESSON_UTC_OFFSET } from '@/lib/format';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import { friendlyError, type ActionState } from './errors';

/**
 * The client sends choices only — beach, level, language and when each
 * meeting happens. A strict schema rejects anything else (a total, a rate, an
 * instructor id) instead of silently dropping it, and the price is derived by
 * create_booking in the database.
 */
const Meeting = z.strictObject({
  date: z.iso.date(),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  hours: z.number().int().min(1).max(8),
});

const CreateBooking = z.strictObject({
  beach: z.enum(['prea', 'jeri']),
  level: z.enum(['first_time', 'returning', 'improving']),
  language: z.enum(['Português', 'Inglês', 'Espanhol', 'Francês', 'Alemão', 'Italiano']),
  meetings: z.array(Meeting).min(1).max(8),
});

export async function createBooking(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['student'], '/aluno/reservar');

  let meetings: unknown;
  try {
    meetings = JSON.parse(String(form.get('meetings') ?? '[]'));
  } catch {
    return { error: 'Encontros inválidos.' };
  }
  const parsed = CreateBooking.safeParse({
    beach: form.get('beach'),
    level: form.get('level'),
    language: form.get('language'),
    meetings,
  });
  if (!parsed.success) return { error: 'Confira praia, nível, idioma e os encontros.' };

  const totalHours = parsed.data.meetings.reduce((sum, meeting) => sum + meeting.hours, 0);
  if (totalHours > 8) return { error: 'Cada reserva tem de 1 a 8 horas no total.' };

  const referral = (await cookies()).get('vento_ref')?.value ?? null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('create_booking', {
    p_beach: parsed.data.beach,
    p_level: parsed.data.level,
    p_language: parsed.data.language,
    p_meetings: parsed.data.meetings.map((meeting) => ({
      starts_at: `${meeting.date}T${meeting.start}:00${LESSON_UTC_OFFSET}`,
      hours: meeting.hours,
    })),
    p_partner_code: referral,
  });
  if (error || typeof data !== 'string') return { error: friendlyError(error) };

  revalidatePath('/aluno/aulas');
  redirect(`/aluno/reserva/${data}`);
}

const BookingId = z.uuid();

/** Simulated payment until a gateway is integrated. Moves no money. */
export async function confirmTestPayment(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['student']);
  const id = BookingId.safeParse(form.get('bookingId'));
  if (!id.success) return { error: 'Reserva inválida.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('confirm_test_payment', { p_booking_id: id.data });
  if (error) return { error: friendlyError(error) };

  revalidatePath(`/aluno/reserva/${id.data}`);
  revalidatePath('/aluno/aulas');
  return { ok: 'Pagamento de teste confirmado. Sua aula está reservada.' };
}
