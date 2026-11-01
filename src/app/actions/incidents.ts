'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { friendlyError, type ActionState } from './errors';

export async function reportLessonIncident(_previous: ActionState,form: FormData): Promise<ActionState> {
  const viewer=await requireRole(['student','instructor']);
  if(viewer.role!=='student'&&viewer.role!=='instructor')return {error:'Apenas alunos e instrutores podem relatar um imprevisto.'};
  const ids=String(form.get('meeting')??'').split(':');
  const parsed=z.strictObject({
    booking:z.uuid(),meeting:z.uuid(),
    type:z.enum(['weather','absence','equipment','safety','other']),
    minutes:z.coerce.number().int().min(0).max(480),
    description:z.string().trim().min(10).max(1000),
  }).safeParse({booking:ids[0],meeting:ids[1],type:form.get('type'),
    minutes:form.get('minutes'),description:form.get('description')});
  if(!parsed.success)return {error:'Confira o encontro, motivo, minutos realizados e descrição (mínimo de 10 caracteres).'};
  const db=await createSupabaseServerClient();
  const {error}=await db.rpc('report_lesson_incident',{
    p_booking_id:parsed.data.booking,p_meeting_id:parsed.data.meeting,
    p_type:parsed.data.type,p_minutes_done:parsed.data.minutes,
    p_description:parsed.data.description,
  });
  if(error) {
    console.error('[incident.report]',{code:error.code,message:error.message});
    return {error:friendlyError(error)};
  }
  revalidatePath('/aluno/ocorrencias');revalidatePath('/instrutor/ocorrencias');
  revalidatePath('/admin/ocorrencias');
  return {ok:'Ocorrência registrada e enviada para análise da administração.'};
}

export async function reviewLessonIncident(_previous: ActionState,form: FormData): Promise<ActionState> {
  const viewer=await requireRole(['admin']);
  if(viewer.role!=='admin')return {error:'Somente a administração pode analisar ocorrências.'};
  const parsed=z.strictObject({
    id:z.uuid(),status:z.enum(['reviewing','resolved','rejected']),
    resolution:z.string().trim().min(5).max(1000),
  }).safeParse({id:form.get('id'),status:form.get('status'),resolution:form.get('resolution')});
  if(!parsed.success)return {error:'Informe a decisão e sua justificativa (mínimo de 5 caracteres).'};
  const db=await createSupabaseServerClient();
  const {error}=await db.rpc('review_lesson_incident',{
    p_incident_id:parsed.data.id,p_status:parsed.data.status,
    p_resolution:parsed.data.resolution,
  });
  if(error) {
    console.error('[incident.review]',{code:error.code,message:error.message});
    return {error:friendlyError(error)};
  }
  revalidatePath('/admin/ocorrencias');revalidatePath('/aluno/ocorrencias');
  revalidatePath('/instrutor/ocorrencias');
  return {ok:'Análise registrada no histórico da ocorrência.'};
}
