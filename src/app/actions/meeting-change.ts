'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { friendlyError, type ActionState } from './errors';

const UUID=z.uuid();
const ProposedDate=z.string().regex(
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/,
);

function refreshMeetingViews(bookingId?:string) {
  revalidatePath('/instrutor/aula');
  revalidatePath('/instrutor/agenda');
  revalidatePath('/instrutor/hoje');
  revalidatePath('/aluno/aulas');
  revalidatePath('/aluno/evolucao');
  if (bookingId) revalidatePath('/aluno/reserva/'+bookingId);
}

export async function requestMeetingChange(
  _previous:ActionState,form:FormData,
):Promise<ActionState>{
  await requireRole(['student','instructor']);
  const parsed=z.strictObject({
    meetingId:UUID, bookingId:UUID,
    proposedDate:ProposedDate,
    reason:z.string().trim().min(8).max(500),
  }).safeParse({
    meetingId:form.get('meetingId'),
    bookingId:form.get('bookingId'),
    proposedDate:form.get('proposedDate'),
    reason:form.get('reason'),
  });
  if(!parsed.success) return {error:'Informe uma nova data, horário e motivo com pelo menos 8 caracteres.'};
  // Local Ceará times are always -03:00. No browser-dependent timezone parsing.
  const newDate=parsed.data.proposedDate+':00-03:00';
  const epoch=Date.parse(newDate);
  if(!Number.isFinite(epoch)||epoch<Date.now()+72*60*60*1000){
    return {error:'A nova data deve ficar pelo menos 72 horas à frente.'};
  }
  const db=await createSupabaseServerClient();
  const {error}=await db.rpc('request_meeting_change',{
    p_meeting_id:parsed.data.meetingId,
    p_new_start:newDate,
    p_reason:parsed.data.reason,
  });
  if(error){
    console.error('[meeting.change.request]',{code:error.code,message:error.message});
    return {error:friendlyError(error)};
  }
  refreshMeetingViews(parsed.data.bookingId);
  return {ok:'Solicitação enviada! A outra pessoa tem até 48 horas para responder. Sem resposta, a reserva será cancelada.'};
}

export async function respondMeetingChange(
  _previous:ActionState,form:FormData,
):Promise<ActionState>{
  await requireRole(['student','instructor']);
  const parsed=z.strictObject({
    requestId:UUID,
    bookingId:UUID,
    decision:z.enum(['accept','reject']),
  }).safeParse({
    requestId:form.get('requestId'),
    bookingId:form.get('bookingId'),
    decision:form.get('decision'),
  });
  if(!parsed.success)return {error:'Escolha aceitar ou recusar a alteração.'};
  const db=await createSupabaseServerClient();
  const {error}=await db.rpc('respond_meeting_change',{
    p_request_id:parsed.data.requestId,
    p_accept:parsed.data.decision==='accept',
  });
  if(error){
    console.error('[meeting.change.respond]',{code:error.code,message:error.message});
    return {error:friendlyError(error)};
  }
  refreshMeetingViews(parsed.data.bookingId);
  return {ok:parsed.data.decision==='accept'
    ? 'Alteração aceita! O encontro foi atualizado na agenda dos dois.'
    : 'Alteração recusada. O horário original da reserva foi mantido.'};
}
