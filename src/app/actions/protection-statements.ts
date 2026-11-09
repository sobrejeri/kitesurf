'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  protectionStage3Enabled, claimedMinutesValid,
  PROTECTION_DECLARATIONS, PROTECTION_ASSESSMENTS,
} from '@/lib/protection-stage3';
import { friendlyError, type ActionState } from './errors';

const StatementInput = z.strictObject({
  meeting: z.uuid(),
  declaration: z.enum(Object.keys(PROTECTION_DECLARATIONS) as [
    keyof typeof PROTECTION_DECLARATIONS, ...(keyof typeof PROTECTION_DECLARATIONS)[],
  ]),
  scheduledMinutes: z.coerce.number().int().min(1).max(480),
  claimedMinutes: z.coerce.number().int().min(0).max(480),
  narrative: z.string().trim().min(20).max(2000),
});
const ReviewInput = z.strictObject({
  meeting: z.uuid(),
  assessment: z.enum(Object.keys(PROTECTION_ASSESSMENTS) as [
    keyof typeof PROTECTION_ASSESSMENTS, ...(keyof typeof PROTECTION_ASSESSMENTS)[],
  ]),
  rationale: z.string().trim().min(20).max(2000),
});
const refresh = () => {
  revalidatePath('/aluno/ocorrencias');
  revalidatePath('/instrutor/ocorrencias');
  revalidatePath('/admin/ocorrencias');
};

export async function submitProtectionStatement(_previous: ActionState, form: FormData): Promise<ActionState> {
  if (!protectionStage3Enabled()) return {error:'Manifestações estruturadas ainda não estão habilitadas.'};
  const viewer=await requireRole(['student','instructor']);
  if(viewer.role!=='student' && viewer.role!=='instructor')
    return {error:'Somente aluno e instrutor podem registrar manifestações.'};
  const parsed=StatementInput.safeParse({
    meeting:form.get('meeting'),declaration:form.get('declaration'),
    scheduledMinutes:form.get('scheduledMinutes'),claimedMinutes:form.get('claimedMinutes'),
    narrative:form.get('narrative'),
  });
  if(!parsed.success || !claimedMinutesValid(
    parsed.data.declaration,parsed.data.claimedMinutes,parsed.data.scheduledMinutes,
  )) return {error:'Confira a situação, os minutos e a justificativa (mínimo de 20 caracteres).'};
  const db=await createSupabaseServerClient();
  // RPC rechecks booking ownership, meeting duration and time. Hidden form
  // fields are untrusted; no client value changes booking or financial state.
  const {error}=await db.rpc('submit_lesson_protection_statement',{
    p_meeting_id:parsed.data.meeting,p_declaration:parsed.data.declaration,
    p_claimed_minutes:parsed.data.claimedMinutes,p_narrative:parsed.data.narrative,
  });
  if(error){
    console.error('[protection.statement]',{code:error.code,message:error.message});
    return {error:friendlyError(error)};
  }
  refresh();
  return {ok:'Sua manifestação foi registrada com data e versão. Não confirma presença nem autoriza pagamento.'};
}

export async function reviewProtectionStatement(_previous: ActionState, form: FormData): Promise<ActionState> {
  if (!protectionStage3Enabled()) return {error:'A revisão estruturada ainda não está habilitada.'};
  const viewer=await requireRole(['admin']);
  if(viewer.role!=='admin') return {error:'Somente a administração pode analisar o caso.'};
  const parsed=ReviewInput.safeParse({
    meeting:form.get('meeting'),assessment:form.get('assessment'),rationale:form.get('rationale'),
  });
  if(!parsed.success)return {error:'Selecione a recomendação e registre uma justificativa de 20 a 2.000 caracteres.'};
  const db=await createSupabaseServerClient();
  const {error}=await db.rpc('review_lesson_protection_case',{
    p_meeting_id:parsed.data.meeting,p_assessment:parsed.data.assessment,
    p_rationale:parsed.data.rationale,
  });
  if(error){
    console.error('[protection.review]',{code:error.code,message:error.message});
    return {error:friendlyError(error)};
  }
  refresh();
  return {ok:'Análise adicionada ao histórico. Nenhum reembolso ou repasse foi executado.'};
}
