'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { friendlyError, type ActionState } from './errors';

export async function createMeetingPoint(_prev:ActionState,form:FormData):Promise<ActionState> {
  const viewer=await requireRole(['admin']);
  if(viewer.role!=='admin')return {error:'Apenas a administração pode cadastrar locais.'};
  const parsed=z.strictObject({
    beachId:z.uuid(),title:z.string().trim().min(2).max(100),
    details:z.string().trim().max(400),
    latitude:z.coerce.number().min(-90).max(90),
    longitude:z.coerce.number().min(-180).max(180),
  }).safeParse({
    beachId:form.get('beachId'),title:form.get('title'),details:form.get('details')??'',
    latitude:form.get('latitude'),longitude:form.get('longitude'),
  });
  if(!parsed.success)return {error:'Confira a praia, a referência e as coordenadas do local.'};
  const db=await createSupabaseServerClient();
  const {error}=await db.rpc('create_meeting_point',{
    p_beach_id:parsed.data.beachId,p_title:parsed.data.title,
    p_details:parsed.data.details,p_latitude:parsed.data.latitude,p_longitude:parsed.data.longitude,
  });
  if(error)return {error:friendlyError(error)};
  revalidatePath('/admin/pontos');revalidatePath('/instrutor/pontos');
  return {ok:'Ponto de encontro salvo.'};
}

export async function toggleMeetingPoint(_prev:ActionState,form:FormData):Promise<ActionState> {
  const viewer=await requireRole(['admin']);
  if(viewer.role!=='admin')return {error:'Área restrita.'};
  const id=z.uuid().safeParse(form.get('id'));
  const active=z.enum(['true','false']).safeParse(form.get('active'));
  if(!id.success||!active.success)return {error:'Ponto inválido.'};
  const db=await createSupabaseServerClient();
  const {error}=await db.rpc('set_meeting_point_active',{
    p_id:id.data,p_active:active.data==='true',
  });
  if(error)return {error:friendlyError(error)};
  revalidatePath('/admin/pontos');revalidatePath('/instrutor/pontos');
  return {ok:'Situação do ponto de encontro atualizada.'};
}

export async function chooseMeetingPoint(_prev:ActionState,form:FormData):Promise<ActionState> {
  const viewer=await requireRole(['instructor']);
  if(viewer.role!=='instructor')return {error:'Somente o instrutor responsável pode escolher o local.'};
  const booking=z.uuid().safeParse(form.get('bookingId'));
  const point=z.uuid().safeParse(form.get('pointId'));
  if(!booking.success||!point.success)return {error:'Selecione um ponto de encontro válido.'};
  const db=await createSupabaseServerClient();
  const {error}=await db.rpc('assign_booking_meeting_point',{
    p_booking_id:booking.data,p_meeting_point_id:point.data,
  });
  if(error)return {error:friendlyError(error)};
  revalidatePath('/instrutor/pontos');
  revalidatePath('/aluno/reserva/'+booking.data);
  return {ok:'Ponto de encontro informado ao aluno.'};
}
