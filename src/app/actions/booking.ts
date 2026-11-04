'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { lessonDate } from '@/lib/dates';
import { getStudentKiteLevel } from '@/lib/student-kite-level';
import { isAllowedLessonLevel } from '@/lib/kite-steps';
import { LESSON_UTC_OFFSET } from '@/lib/format';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import { friendlyError, type ActionState } from './errors';

/**
 * The client sends choices only — beach, level, language and when each
 * meeting happens. A strict schema rejects anything else (a total, a rate, an
 * instructor id) instead of silently dropping it, and the price is derived by
 * create_instructor_request and then frozen into the booking on acceptance.
 */
const Meeting = z.strictObject({
  date: z.iso.date(),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  hours: z.number().int().min(1).max(8),
});

const CreateBooking = z.strictObject({
  beachId: z.uuid(),
  level: z.enum(['first_time', 'returning', 'improving']),
  language: z.enum(['Português', 'Inglês', 'Espanhol', 'Francês', 'Alemão', 'Italiano']),
  meetings: z.array(Meeting).min(1).max(8),
  // Preserves compatibility with older cached clients that do not send it yet.
  expectedHours: z.coerce.number().int().min(1).max(8).optional(),
  transport: z.enum(['yes', 'no']),
  preferredInstructorId: z.uuid().nullable(),
});

export async function createBooking(_prev: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireRole(['student'], '/aluno/reservar');

  let meetings: unknown;
  try {
    meetings = JSON.parse(String(form.get('meetings') ?? '[]'));
  } catch {
    return { error: 'Encontros inválidos.' };
  }
  const parsed = CreateBooking.safeParse({
    beachId: form.get('beachId'),
    level: form.get('level'),
    language: form.get('language'),
    meetings,
    expectedHours: form.get('expectedHours') ?? undefined,
    transport: form.get('transport') ?? 'no',
    preferredInstructorId: form.get('preferredInstructorId') || null,
  });
  if (!parsed.success) return { error: 'Confira praia, nível, idioma e os encontros.' };

  const studentLevel = await getStudentKiteLevel(viewer.id);
  if (!isAllowedLessonLevel(studentLevel.effective, parsed.data.level)) {
    return { error: 'Esse tipo de aula não está disponível para seu nível atual. Atualize seu perfil ou escolha uma aula compatível.' };
  }
  if (!studentLevel.ready) {
    return { error: 'Atualize o banco de dados para configurar seu nível e continuar a reserva.' };
  }
  const totalHours = parsed.data.meetings.reduce((sum, meeting) => sum + meeting.hours, 0);
  if (totalHours > 8) return { error: 'Cada reserva tem de 1 a 8 horas no total.' };
  if (parsed.data.expectedHours !== undefined && totalHours !== parsed.data.expectedHours) {
    return { error: `Distribua exatamente as ${parsed.data.expectedHours}h escolhidas antes de continuar.` };
  }
  if (parsed.data.meetings.some((meeting) => meeting.date < lessonDate())) {
    return { error: 'Não é possível reservar uma aula em uma data anterior a hoje.' };
  }
  // Server-side overlap validation: a modified browser cannot skip the UI guard.
  const timeSlots = parsed.data.meetings.map((meeting) => {
    const starts = Date.parse(`${meeting.date}T${meeting.start}:00${LESSON_UTC_OFFSET}`);
    return { starts, ends: starts + meeting.hours * 3600000 };
  });
  if (timeSlots.some((slot, i) =>
    timeSlots.some((other, j) => j > i &&
      slot.starts < other.ends && other.starts < slot.ends))) {
    return { error: 'Há encontros no mesmo dia e horário. Separe os horários antes de procurar instrutor.' };
  }
  if (timeSlots.some((slot) => !Number.isFinite(slot.starts) ||
    slot.starts < Date.now() + 3600000)) {
    return { error: 'Os encontros precisam começar daqui a pelo menos uma hora.' };
  }

  const referral = (await cookies()).get('vento_ref')?.value ?? null;

  const supabase = await createSupabaseServerClient();
  const selectedMeetings = parsed.data.meetings.map((meeting) => ({
    starts_at: `${meeting.date}T${meeting.start}:00${LESSON_UTC_OFFSET}`,
    hours: meeting.hours,
  }));
  const { data, error } = await supabase.rpc('create_instructor_request_with_preference', {
    p_beach_id: parsed.data.beachId,
    p_level: parsed.data.level,
    p_language: parsed.data.language,
    p_meetings: selectedMeetings,
    p_partner_code: referral,
    p_with_transport: parsed.data.transport === 'yes',
    p_preferred_instructor_id: parsed.data.preferredInstructorId,
  });
  if (error && (error.code === 'PGRST202' || error.code === '42883')) {
    // Transitional deployment: older Supabase databases do not have the
    // offer engine yet. Preserve existing bookings until SQL migration 13 is
    // installed; never silently discard an explicit instructor preference.
    if (parsed.data.preferredInstructorId) {
      return { error: 'A recontratação com o mesmo instrutor depende da atualização do Supabase. Avise a administração.' };
    }
    const legacy = await supabase.rpc('create_booking', {
      p_beach_id: parsed.data.beachId,
      p_level: parsed.data.level,
      p_language: parsed.data.language,
      p_meetings: selectedMeetings,
      p_partner_code: referral,
      p_with_transport: parsed.data.transport === 'yes',
    });
    if (legacy.error) {
      console.error('[booking.create] Legacy booking failed', { code: legacy.error.code, message: legacy.error.message });
      return { error: friendlyError(legacy.error) };
    }
    if (typeof legacy.data !== 'string' || !z.uuid().safeParse(legacy.data).success) {
      return { error: 'Não foi possível abrir a reserva. Avise a administração.' };
    }
    revalidatePath('/aluno/aulas');
    redirect(`/aluno/reserva/${legacy.data}`);
  }
  if (error) {
    console.error('[booking.request] RPC create_instructor_request_with_preference failed', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { error: friendlyError(error) };
  }
  if (typeof data !== 'string' || !z.uuid().safeParse(data).success) {
    console.error('[booking.request] Unexpected RPC response from create_instructor_request_with_preference');
    return { error: 'Não foi possível confirmar a solicitação. Informe a administração e tente novamente.' };
  }

  revalidatePath('/aluno/aulas');
  redirect(`/aluno/solicitacao/${data}`);
}

const BookingId = z.uuid();

/** Simulated payment until a gateway is integrated. Moves no money. */
export async function confirmTestPayment(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['student']);
  const id = BookingId.safeParse(form.get('bookingId'));
  if (!id.success) return { error: 'Reserva inválida.' };

  const method = z.enum(['pix', 'card']).safeParse(form.get('method'));
  const outcome = z.enum(['approved', 'pending', 'declined']).safeParse(form.get('outcome'));
  if (!method.success || !outcome.success) {
    return { error: 'Escolha o método e o resultado da simulação.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('simulate_test_payment', {
    p_booking_id: id.data, p_method: method.data, p_outcome: outcome.data,
  });
  if (error) {
    console.error('[payment.simulate]', { code: error.code, message: error.message });
    return { error: friendlyError(error) };
  }

  revalidatePath(`/aluno/reserva/${id.data}`);
  revalidatePath('/aluno/aulas');
  if (outcome.data === 'pending') return { ok: 'Simulação pendente registrada. Nenhum pagamento realizado.' };
  if (outcome.data === 'declined') return { error: 'Pagamento de teste recusado. Tente outra simulação.' };
  return { ok: 'Pagamento de teste aprovado. Nenhum valor foi cobrado.' };
}
