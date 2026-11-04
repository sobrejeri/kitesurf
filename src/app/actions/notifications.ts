'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { friendlyError, type ActionState } from './errors';

export async function markNotificationRead(_prev:ActionState,form:FormData):Promise<ActionState> {
  await requireRole(['student','instructor','admin','partner']);
  const parsed=z.uuid().safeParse(form.get('notificationId'));
  if(!parsed.success)return {error:'Aviso inválido.'};
  const db=await createSupabaseServerClient();
  const {error}=await db.rpc('mark_my_notification_read',{p_id:parsed.data});
  if(error) {
    console.error('[notification.read]',{code:error.code,message:error.message});
    return {error:friendlyError(error)};
  }
  revalidatePath('/aluno/avisos');revalidatePath('/instrutor/avisos');
  revalidatePath('/admin/avisos');
  return {ok:'Aviso marcado como lido.'};
}
