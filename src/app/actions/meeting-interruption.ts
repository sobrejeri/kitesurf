'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import {
  REASON_MAX, REASON_MIN, checkMinutesAndSteps, interruptionFlowEnabled, parseFortalezaLocal, parseStepSelections,
} from '@/lib/meeting-interruption';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import { friendlyError, type ActionState } from './errors';

/**
 * #93 Etapa 2/4. Server Actions do instrutor para concluir, interromper e retomar uma aula.
 * O navegador nunca chama RPC: só estas ações, que (1) exigem o papel de instrutor, (2) respeitam a feature flag (desligada por
 * padrão), (3) validam com zod strict (nada de aluno, instrutor ou valor vindo do cliente) e (4) deixam o banco decidir dono,
 * estado, conflito e ordem. Se as RPCs não existirem no banco (migration não aplicada), falham fechado.
 */
const NOT_ENABLED: ActionState = { error: 'Este recurso ainda não foi liberado.' };
const NOT_INSTALLED: ActionState = { error: 'A interrupção de aula ainda não está disponível no banco. Avise a administração.' };
const missing = (error: { code?: string }) => error.code === 'PGRST202' || error.code === '42883';

const Minutes = z.string().regex(/^(?:0|[1-9][0-9]{0,2})$/).transform(Number).pipe(z.number().int().min(0).max(480));
const Positive = z.string().regex(/^[1-9][0-9]{0,2}$/).transform(Number).pipe(z.number().int().min(1).max(480));

function revalidateAll() {
  revalidatePath('/instrutor/aula');
  revalidatePath('/instrutor/hoje');
  revalidatePath('/aluno/evolucao');
  revalidatePath('/aluno/aulas');
}

/** Concluir normalmente: o minuto a menos NÃO vira saldo. Habilidades gravadas junto, numa só operação do banco. */
export async function completeMeeting(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['instructor']);
  if (!interruptionFlowEnabled()) return NOT_ENABLED;
  const parsed = z.strictObject({ meetingId: z.uuid(), doneMinutes: Minutes }).safeParse({
    meetingId: form.get('meetingId'), doneMinutes: form.get('doneMinutes'),
  });
  if (!parsed.success) return { error: 'Confira os minutos realizados.' };
  const steps = parseStepSelections((name) => form.get(name));
  if ('error' in steps) return { error: steps.error };
  const problem = checkMinutesAndSteps(parsed.data.doneMinutes, steps);
  if (problem) return { error: problem };

  const db = await createSupabaseServerClient();
  const { error } = await db.rpc('complete_meeting_with_skills', {
    p_meeting_id: parsed.data.meetingId, p_done_minutes: parsed.data.doneMinutes,
    p_practiced_steps: steps.practiced, p_mastered_steps: steps.mastered,
  });
  if (error) return missing(error) ? NOT_INSTALLED : { error: friendlyError(error) };
  revalidateAll();
  return { ok: 'Aula concluída! As etapas trabalhadas já aparecem na evolução do aluno.' };
}

/** Interrupção excepcional: motivo, minutos ministrados e tempo restante; o aluno é avisado e vai ao chat da reserva. */
export async function interruptMeeting(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['instructor']);
  if (!interruptionFlowEnabled()) return NOT_ENABLED;
  const parsed = z.strictObject({
    meetingId: z.uuid(),
    reason: z.string().trim().min(REASON_MIN).max(REASON_MAX),
    doneMinutes: Minutes,
    remainingMinutes: Positive,
  }).safeParse({
    meetingId: form.get('meetingId'), reason: form.get('reason'),
    doneMinutes: form.get('doneMinutes'), remainingMinutes: form.get('remainingMinutes'),
  });
  if (!parsed.success) return { error: `Informe o motivo (${REASON_MIN} a ${REASON_MAX} caracteres), os minutos dados e o tempo restante.` };
  const steps = parseStepSelections((name) => form.get(name));
  if ('error' in steps) return { error: steps.error };
  const problem = checkMinutesAndSteps(parsed.data.doneMinutes, steps);
  if (problem) return { error: problem };

  const db = await createSupabaseServerClient();
  const { error } = await db.rpc('interrupt_meeting', {
    p_meeting_id: parsed.data.meetingId, p_reason: parsed.data.reason,
    p_done_minutes: parsed.data.doneMinutes, p_remaining_minutes: parsed.data.remainingMinutes,
    p_practiced_steps: steps.practiced, p_mastered_steps: steps.mastered,
  });
  if (error) return missing(error) ? NOT_INSTALLED : { error: friendlyError(error) };
  revalidateAll();
  return { ok: 'Aula interrompida. O aluno foi avisado e pode falar com você pelo chat. Agende a continuidade quando combinarem.' };
}

/** Agenda (ou reagenda) a continuidade do MESMO encontro. O horário é de Fortaleza; agenda, ordem e conflitos são conferidos no banco. */
export async function scheduleMeetingResume(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['instructor']);
  if (!interruptionFlowEnabled()) return NOT_ENABLED;
  const parsed = z.strictObject({ meetingId: z.uuid(), startsAt: z.string() }).safeParse({
    meetingId: form.get('meetingId'), startsAt: form.get('startsAt'),
  });
  if (!parsed.success) return { error: 'Escolha a data e a hora da continuidade.' };
  const when = parseFortalezaLocal(parsed.data.startsAt);
  if ('error' in when) return { error: when.error };

  const db = await createSupabaseServerClient();
  const { error } = await db.rpc('schedule_meeting_resume', { p_meeting_id: parsed.data.meetingId, p_starts_at: when.iso });
  if (error && /Student already has a meeting/i.test(error.message ?? '')) {
    return { error: 'O aluno já tem outro encontro nesse horário. Escolha outro horário.' };
  }
  if (error) return missing(error) ? NOT_INSTALLED : { error: friendlyError(error) };
  revalidateAll();
  return { ok: 'Continuidade agendada. O aluno foi avisado. Para retomar, use o mesmo código de presença.' };
}
