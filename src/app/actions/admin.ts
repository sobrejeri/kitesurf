'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import { friendlyError, type ActionState } from './errors';
import { moneyInputCents } from '@/lib/level-prices';
import { PROFILE_REQUIRED, readProgressFlags } from '@/lib/instructor-completion';

/** Each publication atomically versions all three lesson rates. */
const Price = z.strictObject({
  beginnerCents: z.number().int().min(1000).max(1000000),
  intermediateCents: z.number().int().min(1000).max(1000000),
  advancedCents: z.number().int().min(1000).max(1000000),
  commissionPercent: z.coerce.number().int().min(0).max(100),
  transportCents: z.number().int().min(0).max(1000000),
  expectedVersionId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});

export async function publishPrice(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['admin']);
  const parsed = Price.safeParse({
    beginnerCents: moneyInputCents(form.get('beginnerRateReais')),
    intermediateCents: moneyInputCents(form.get('intermediateRateReais')),
    advancedCents: moneyInputCents(form.get('advancedRateReais')),
    commissionPercent: form.get('commissionPercent'),
    transportCents: moneyInputCents(form.get('transportRateReais')),
    expectedVersionId: form.get('expectedVersionId'),
    reason: form.get('reason'),
  });
  if (!parsed.success) return { error: 'Confira os três valores por hora, a comissão e o motivo. Use até duas casas decimais nos valores.' };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('publish_level_price_version', {
    p_beginner_cents: parsed.data.beginnerCents,
    p_intermediate_cents: parsed.data.intermediateCents,
    p_advanced_cents: parsed.data.advancedCents,
    p_commission_bps: parsed.data.commissionPercent * 100,
    p_transport_hourly_cents: parsed.data.transportCents,
    p_reason: parsed.data.reason,
    p_expected_version_id: parsed.data.expectedVersionId,
  });
  if (error?.hint === 'PRICE_VERSION_STALE') return { error: 'Os preços foram alterados em outra sessão. Atualize a página antes de publicar.' };
  if (error) return { error: friendlyError(error) };
  revalidatePath('/admin/regras');
  revalidatePath('/aluno', 'layout');
  return { ok: 'Valores por nível publicados. Reservas existentes mantêm o preço contratado.' };
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
  if (parsed.data.status==='approved') {
    const {data:instructor,error:statusError}=await supabase.from('instructors')
      .select('approved_at').eq('id',parsed.data.instructorId)
      .maybeSingle<{approved_at:string|null}>();
    if(statusError)return {error:friendlyError(statusError)};
    if(!instructor)return {error:'Instrutor não encontrado.'};
    if(!instructor.approved_at) {
      const completion=await supabase.rpc('get_instructor_profile_progress',{
        p_instructor_id:parsed.data.instructorId,
      });
      if(!completion.error) {
        const flags=readProgressFlags(completion.data);
        if(!flags)return {error:'Não foi possível verificar o preenchimento. Atualize a página e tente novamente.'};
        const missing=PROFILE_REQUIRED.filter(field=>!flags[field.key]).map(field=>field.label);
        if(missing.length>0)return {
          error:'Antes da aprovação, o instrutor precisa completar: '+missing.join(', ')+'.',
        };
      } else if(!['42883','PGRST202'].includes(completion.error.code??'')) {
        return {error:friendlyError(completion.error)};
      }
    }
  }
  const { error } = await supabase.rpc('set_instructor_status', {
    p_instructor_id: parsed.data.instructorId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/admin/instrutores');
  revalidatePath('/admin/instrutores/[id]', 'page');
  revalidatePath('/instrutor', 'layout');
  revalidatePath('/instrutor/cadastro');
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
  revalidatePath('/admin/afiliados/[id]', 'page');
  revalidatePath('/afiliado', 'layout');
  revalidatePath('/afiliado/perfil');
  revalidatePath('/afiliado/central');
  revalidatePath('/afiliado/divulgacao');
  return { ok: 'Afiliado aprovado. O link de indicação foi liberado.' };
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

// Percentages use integer basis points (100 bps = 1%).
// Accept at most two decimal places; never calculate a monetary value in JS.
function parseCommissionBps(raw: FormDataEntryValue | null, maxBps: number): number | null {
  if (typeof raw !== 'string' || !/^\d{1,3}(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fractional = ''] = raw.split('.');
  const bps = Number(whole) * 100 + Number(fractional.padEnd(2, '0'));
  return Number.isSafeInteger(bps) && bps <= maxBps ? bps : null;
}

export async function setIndividualInstructorCommission(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireRole(['admin']);
  const parsed = z.strictObject({
    instructorId: z.uuid(),
    mode: z.enum(['global', 'custom']),
    reason: z.string().trim().min(3).max(500),
  }).safeParse({
    instructorId: form.get('instructorId'),
    mode: form.get('mode'),
    reason: form.get('reason'),
  });
  if (!parsed.success) return { error: 'Confira o instrutor e informe o motivo da alteração.' };
  const commissionBps = parsed.data.mode === 'global'
    ? null : parseCommissionBps(form.get('commissionPercent'), 10000);
  if (parsed.data.mode === 'custom' && commissionBps === null) {
    return { error: 'Informe a comissão de 0 a 100%, com até duas casas decimais.' };
  }
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc('set_instructor_commission', {
    p_instructor_id: parsed.data.instructorId,
    p_commission_bps: commissionBps,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/admin/instrutores');
  revalidatePath('/admin/instrutores/[id]', 'page');
  revalidatePath('/admin/regras');
  revalidatePath('/instrutor/cadastro');
  revalidatePath('/instrutor/financeiro');
  return { ok: commissionBps === null
    ? 'Instrutor voltou a utilizar a comissão global. Reservas antigas não mudam.'
    : 'Comissão individual salva para novas reservas. Reservas antigas não mudam.' };
}

export async function setIndividualPartnerCommission(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireRole(['admin']);
  const parsed = z.strictObject({
    partnerId: z.uuid(),
    reason: z.string().trim().min(3).max(500),
  }).safeParse({
    partnerId: form.get('partnerId'),
    reason: form.get('reason'),
  });
  if (!parsed.success) return { error: 'Confira o afiliado e informe o motivo.' };
  const commissionBps = parseCommissionBps(form.get('commissionPercent'), 5000);
  if (commissionBps === null) {
    return { error: 'Informe a comissão do afiliado de 0 a 50%, com até duas casas decimais.' };
  }
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc('set_partner_commission', {
    p_partner_id: parsed.data.partnerId,
    p_commission_bps: commissionBps,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/admin/afiliados');
  revalidatePath('/admin/afiliados/[id]', 'page');
  revalidatePath('/afiliado', 'layout');
  revalidatePath('/afiliado/perfil');
  revalidatePath('/afiliado/central');
  revalidatePath('/afiliado/divulgacao');
  revalidatePath('/afiliado/indicacoes');
  return { ok: 'Comissão do afiliado atualizada para novas reservas. As anteriores não mudam.' };
}
