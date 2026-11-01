'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { friendlyError, type ActionState } from './errors';

const UUID=z.uuid();

export async function suggestAlternativeDate(_prev: ActionState, form: FormData): Promise<ActionState> {
  const viewer=await requireRole(['instructor']);
  if(viewer.role!=='instructor')return {error:'Apenas instrutores podem propor outra data.'};
  const offerId=UUID.safeParse(form.get('offerId'));
  const hours=z.coerce.number().int().min(1).max(8).safeParse(form.get('totalHours'));
  const localStart=z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/).safeParse(form.get('start'));
  if(!offerId.success||!hours.success||!localStart.success) return {error:'Confira a data, o horário e a duração.'};
  const iso=localStart.data+':00-03:00';
  if(!Number.isFinite(Date.parse(iso)) || Date.parse(iso)<=Date.now()+3600000)
    return {error:'Escolha um horário com pelo menos uma hora de antecedência.'};
  const db=await createSupabaseServerClient();
  const {error}=await db.rpc('suggest_instructor_dates',{
    p_offer_id:offerId.data,p_meetings:[{starts_at:iso,hours:hours.data}],
  });
  if(error) {
    console.error('[offer.suggest]',{code:error.code,message:error.message});
    return {error:friendlyError(error)};
  }
  revalidatePath('/instrutor/solicitacao');
  return {ok:'Nova data sugerida. Aguardando resposta do aluno.'};
}

export async function respondToSuggestedDate(_prev: ActionState,form: FormData): Promise<ActionState> {
  const viewer=await requireRole(['student']);
  if(viewer.role!=='student')return {error:'Apenas o aluno pode confirmar a nova data.'};
  const offerId=UUID.safeParse(form.get('offerId'));
  const choice=z.enum(['accept','decline']).safeParse(form.get('decision'));
  const requestId=UUID.safeParse(form.get('requestId'));
  if(!offerId.success||!choice.success||!requestId.success)return {error:'Proposta inválida.'};
  const db=await createSupabaseServerClient();
  const {error}=await db.rpc('respond_to_offer_suggestion',{
    p_offer_id:offerId.data,p_accept:choice.data==='accept',
  });
  if(error) {
    console.error('[offer.suggestion_response]',{code:error.code,message:error.message});
    return {error:friendlyError(error)};
  }
  revalidatePath('/aluno/solicitacao/'+requestId.data);
  revalidatePath('/instrutor/solicitacao');
  return {ok:choice.data==='accept'
    ? 'Nova data aceita. O instrutor poderá confirmar a aula.'
    : 'Proposta recusada. A busca continuará pela fila.'};
}
