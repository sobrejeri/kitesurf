'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { friendlyError, type ActionState } from './errors';

const UUID=z.uuid();
const DateTime=z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/);

function refresh() {
  revalidatePath('/admin/aula-teste');
  revalidatePath('/admin/reservas');
  revalidatePath('/admin/agenda');
  revalidatePath('/instrutor/hoje');
  revalidatePath('/instrutor/agenda');
  revalidatePath('/instrutor/aula');
  revalidatePath('/instrutor/financeiro');
  revalidatePath('/admin/financeiro');
  revalidatePath('/aluno/aulas');
}

/** Only admins may create a test booking; SQL independently validates role. */
export async function createAdminTestLesson(_prev:ActionState,form:FormData):Promise<ActionState> {
  const viewer=await requireRole(['admin']);
  if(viewer.role!=='admin')return {error:'Esta ação é restrita à administração.'};
  const parsed=z.strictObject({
    instructorId:UUID,studentId:UUID,beachId:UUID,
    start:DateTime,
    hours:z.coerce.number().int().min(1).max(8),
  }).safeParse({
    instructorId:form.get('instructorId'),studentId:form.get('studentId'),
    beachId:form.get('beachId'),start:form.get('start'),hours:form.get('hours'),
  });
  if(!parsed.success)return {error:'Escolha instrutor, aluno, praia, data e duração.'};
  const localISO=parsed.data.start+':00-03:00';
  const date=Date.parse(localISO);
  if(!Number.isFinite(date)||date<Date.now()+3600000||date>Date.now()+60*86400000)
    return {error:'Marque a aula para daqui a pelo menos 1 hora, dentro de 60 dias.'};
  const db=await createSupabaseServerClient();
  const {data,error}=await db.rpc('create_admin_test_lesson',{
    p_instructor_id:parsed.data.instructorId,
    p_student_id:parsed.data.studentId,
    p_beach_id:parsed.data.beachId,
    p_starts_at:localISO,
    p_hours:parsed.data.hours,
  });
  if(error){
    console.error('[admin.test_lesson.create]',{code:error.code,message:error.message});
    return {error:friendlyError(error)};
  }
  refresh();
  return {ok:'Aula de teste agendada! Código interno: '+String(data).slice(0,8)+'. Consulte a lista abaixo e confira a conta do instrutor.'};
}

export async function cancelAdminTestLesson(_prev:ActionState,form:FormData):Promise<ActionState> {
  const viewer=await requireRole(['admin']);
  if(viewer.role!=='admin')return {error:'Esta ação é restrita à administração.'};
  const parsed=UUID.safeParse(form.get('bookingId'));
  if(!parsed.success)return {error:'Aula de teste inválida.'};
  const db=await createSupabaseServerClient();
  const {error}=await db.rpc('cancel_admin_test_lesson',{p_booking_id:parsed.data});
  if(error){
    console.error('[admin.test_lesson.cancel]',{code:error.code,message:error.message});
    return {error:friendlyError(error)};
  }
  refresh();
  return {ok:'Aula teste cancelada. Ela não aparecerá nos próximos encontros.'};
}
