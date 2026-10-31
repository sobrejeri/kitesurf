'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import { friendlyError, type ActionState } from './errors';

/**
 * The hourly rate is typed in whole reais and the commission in whole
 * percent, because that is how an operator thinks. Both are integers, and the
 * conversion to centavos and basis points is integer multiplication.
 */
const Price = z.strictObject({
  hourlyRateReais: z.coerce.number().int().min(10).max(10000),
  commissionPercent: z.coerce.number().int().min(0).max(100),
  transportRateReais: z.coerce.number().int().min(0).max(10000),
  reason: z.string().trim().min(3).max(500),
});

export async function publishPrice(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['admin']);
  const parsed = Price.safeParse({
    hourlyRateReais: form.get('hourlyRateReais'),
    commissionPercent: form.get('commissionPercent'),
    transportRateReais: form.get('transportRateReais'),
    reason: form.get('reason'),
  });
  if (!parsed.success) return { error: 'Use valores inteiros e informe o motivo da alteração.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('publish_price_version', {
    p_hourly_rate_cents: parsed.data.hourlyRateReais * 100,
    p_commission_bps: parsed.data.commissionPercent * 100,
    p_transport_hourly_cents: parsed.data.transportRateReais * 100,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/admin/regras');
  revalidatePath('/aluno/inicio');
  return { ok: 'Novo valor publicado. Reservas existentes mantêm o preço contratado.' };
}

const InstructorStatus = z.strictObject({
  instructorId: z.uuid(),
  status: z.enum(['approved', 'paused']),
  reason: z.string().trim().min(3).max(500),
});

export async function setInstructorStatus(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['admin']);
  const parsed = InstructorStatus.safeParse({
    instructorId: form.get('instructorId'),
    status: form.get('status'),
    reason: form.get('reason'),
  });
  if (!parsed.success) return { error: 'Informe o motivo.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_instructor_status', {
    p_instructor_id: parsed.data.instructorId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/admin/instrutores');
  return { ok: parsed.data.status === 'approved' ? 'Instrutor liberado para pedidos.' : 'Instrutor pausado. A posição na fila foi preservada.' };
}

const PartnerStatus = z.strictObject({ partnerId: z.uuid(), reason: z.string().trim().min(3).max(500) });

export async function approvePartner(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['admin']);
  const parsed = PartnerStatus.safeParse({ partnerId: form.get('partnerId'), reason: form.get('reason') });
  if (!parsed.success) return { error: 'Informe o motivo.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_partner_status', {
    p_partner_id: parsed.data.partnerId,
    p_status: 'approved',
    p_reason: parsed.data.reason,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/admin/afiliados');
  return { ok: 'Pousada aprovada.' };
}

const NewBeach = z.strictObject({
  name: z.string().trim().min(2).max(60),
  region: z.string().trim().max(60),
});

export async function createBeach(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['admin']);
  const parsed = NewBeach.safeParse({ name: form.get('name'), region: form.get('region') ?? '' });
  if (!parsed.success) return { error: 'O nome da praia precisa ter de 2 a 60 letras.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('create_beach', { p_name: parsed.data.name, p_region: parsed.data.region });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/admin/praias');
  return { ok: `${parsed.data.name} cadastrada. Os instrutores já podem marcá-la no perfil.` };
}

const EditBeach = z.strictObject({
  beachId: z.uuid(),
  name: z.string().trim().min(2).max(60),
  region: z.string().trim().max(60),
  active: z.enum(['true', 'false']),
});

export async function updateBeach(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['admin']);
  const parsed = EditBeach.safeParse({
    beachId: form.get('beachId'),
    name: form.get('name'),
    region: form.get('region') ?? '',
    active: form.get('active'),
  });
  if (!parsed.success) return { error: 'Confira o nome da praia.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('update_beach', {
    p_beach_id: parsed.data.beachId,
    p_name: parsed.data.name,
    p_region: parsed.data.region,
    p_active: parsed.data.active === 'true',
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/admin/praias');
  return { ok: parsed.data.active === 'true' ? 'Praia salva.' : 'Praia desativada. Reservas existentes não mudam.' };
}
