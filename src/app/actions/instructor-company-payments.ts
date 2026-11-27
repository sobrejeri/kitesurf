'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ActionState } from './errors';

export async function confirmCompanyPayment(_state: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireRole(['instructor']);
  if (viewer.role !== 'instructor') return { error: 'Apenas o instrutor pode confirmar seus recebimentos.' };
  if (process.env.NEXT_PUBLIC_VENTO_BUSINESS_PAYMENTS_ENABLED !== 'true') {
    return { error: 'Os recebimentos de escolas ainda não estão disponíveis.' };
  }
  const id = z.uuid().safeParse(form.get('paymentId'));
  if (!id.success || form.get('acknowledge') !== 'yes') return { error: 'Confira e confirme o recebimento antes de continuar.' };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('company_instructor_payments')
    .select('id,instructor_id,confirmed_at,voided_at').eq('id', id.data).eq('instructor_id', viewer.id).maybeSingle();
  if (error || !data || data.id !== id.data || data.instructor_id !== viewer.id) return { error: 'Não foi possível localizar este recebimento. Atualize a página e tente novamente.' };
  if (data.confirmed_at || data.voided_at) return { error: 'Este registro já foi confirmado ou cancelado. Atualize a página.' };
  const result = await supabase.rpc('confirm_instructor_payment', { p_payment: id.data });
  if (result.error) return { error: 'Não foi possível confirmar. Atualize a página e confira a situação do registro.' };
  revalidatePath('/instrutor/financeiro/recebimentos');
  return { ok: 'Recebimento confirmado.' };
}
