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
    return {error:'A nova data deve estar no futuro, mantendo o prazo mínimo de 72 horas.'};
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
  return {ok:'Solicitação enviada! A outra pessoa tem 12 horas para responder. O horário original permanece até haver aprovação.'};
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

/** Student chooses cancellation or new instructor only after rejected/expired change. */
export async function resolveStudentChange(_previous:ActionState,form:FormData):Promise<ActionState>{
  const viewer=await requireRole(['student']);
  if(viewer.role!=='student')return {error:'Apenas o aluno pode decidir.'};
  const parsed=z.strictObject({
    requestId:UUID,
    bookingId:UUID,
    choice:z.enum(['cancel','replace']),
  }).safeParse({
    requestId:form.get('requestId'),
    bookingId:form.get('bookingId'),
    choice:form.get('choice'),
  });
  if(!parsed.success)return {error:'Escolha cancelar ou buscar outro instrutor.'};
  const db=await createSupabaseServerClient();
  const {error}=await db.rpc('resolve_student_change',{
    p_request_id:parsed.data.requestId,p_choice:parsed.data.choice,
  });
  if(error){
    console.error('[meeting.change.student_choice]',{code:error.code,message:error.message});
    return {error:friendlyError(error)};
  }
  refreshMeetingViews(parsed.data.bookingId);
  return {ok:parsed.data.choice==='cancel'
    ? 'Reserva cancelada. Consulte a administração sobre eventual reembolso.'
    : 'Reserva preservada! Buscando outro instrutor na fila.'};
}

export async function releaseMyBooking(_previous:ActionState,form:FormData):Promise<ActionState>{
  const viewer=await requireRole(['instructor']);
  if(viewer.role!=='instructor')return {error:'Apenas o instrutor responsável pode liberar a reserva.'};
  const parsed=z.strictObject({
    bookingId:UUID,
    reason:z.string().trim().min(8).max(500),
  }).safeParse({bookingId:form.get('bookingId'),reason:form.get('reason')});
  if(!parsed.success)return {error:'Explique o motivo da desistência (mínimo 8 caracteres).'};
  const db=await createSupabaseServerClient();
  const {error}=await db.rpc('release_my_booking',{
    p_booking_id:parsed.data.bookingId,p_reason:parsed.data.reason,
  });
  if(error){
    console.error('[meeting.change.release]',{code:error.code,message:error.message});
    return {error:friendlyError(error)};
  }
  refreshMeetingViews(parsed.data.bookingId);
  return {ok:'Você foi desvinculado desta reserva. O aluno mantém a contratação e a fila buscará outro instrutor.'};
}

export async function respondBookingReassignment(
  _previous:ActionState,form:FormData,
):Promise<ActionState>{
  const viewer=await requireRole(['instructor']);
  if(viewer.role!=='instructor')return {error:'Apenas o instrutor pode responder à oferta.'};
  const parsed=z.strictObject({
    offerId:UUID,
    decision:z.enum(['accept','decline']),
  }).safeParse({offerId:form.get('offerId'),decision:form.get('decision')});
  if(!parsed.success)return {error:'Escolha aceitar ou recusar a oferta.'};
  const db=await createSupabaseServerClient();
  const {error}=await db.rpc('respond_booking_reassignment',{
    p_offer_id:parsed.data.offerId,p_accept:parsed.data.decision==='accept',
  });
  if(error){
    console.error('[meeting.change.reassignment]',{code:error.code,message:error.message});
    return {error:friendlyError(error)};
  }
  refreshMeetingViews();
  revalidatePath('/instrutor/solicitacao');
  return {ok:parsed.data.decision==='accept'
    ? 'Reserva assumida! Consulte os encontros na agenda.'
    : 'Oferta recusada. A fila continuará com o próximo instrutor.'};
}
