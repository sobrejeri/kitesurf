'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isValidTaxId, normalizeTaxId, taxIdKind, taxIdLabel } from '@/lib/tax-id';

import { friendlyError, type ActionState } from './errors';

const MISSING = 'O campo de CPF ou CNPJ ainda não está ativado. Aplique a migração 47 no Supabase.';
const INVALID = 'CPF ou CNPJ inválido. Confira os números.';

function readable(error: { code?: string; message?: string }): string {
  if (['PGRST202', 'PGRST205', 'PGRST204', '42P01', '42883'].includes(error.code ?? '')) return MISSING;
  return friendlyError(error);
}

function refresh() {
  revalidatePath('/instrutor/cadastro');
  revalidatePath('/afiliado/perfil');
  revalidatePath('/admin/instrutores/[id]', 'page');
  revalidatePath('/admin/afiliados');
  revalidatePath('/admin/afiliados/[id]', 'page');
}

const Own = z.strictObject({ taxId: z.string().trim().min(11).max(24) });

/** The holder's own CPF or CNPJ. Never logged: only the error code is. */
export async function saveMyTaxId(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireRole(['instructor', 'partner']);
  if (viewer.role !== 'instructor' && viewer.role !== 'partner') {
    return { error: 'Apenas instrutores e afiliados informam CPF ou CNPJ.' };
  }
  const parsed = Own.safeParse({ taxId: form.get('taxId') });
  const clean = parsed.success ? normalizeTaxId(parsed.data.taxId) : '';
  const kind = taxIdKind(clean);
  if (!kind || !isValidTaxId(clean)) return { error: INVALID };

  const db = await createSupabaseServerClient();
  const { error } = await db.rpc('set_my_tax_id', { p_number: clean });
  if (error) {
    console.error('[tax-id.save]', { code: error.code });
    return { error: readable(error) };
  }
  refresh();
  return { ok: `${taxIdLabel(kind)} salvo. Fica privado: só você e a equipe VentoKite veem.` };
}

const Correction = z.strictObject({
  profileId: z.uuid(),
  taxId: z.string().trim().min(11).max(24),
  reason: z.string().trim().min(3).max(500),
});

/** Administrative correction, with the reason kept in the audit log. */
export async function adminCorrectTaxId(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['admin']);
  const parsed = Correction.safeParse({
    profileId: form.get('profileId'),
    taxId: form.get('taxId'),
    reason: form.get('reason'),
  });
  if (!parsed.success) return { error: 'Informe o CPF ou CNPJ e o motivo da correção.' };
  const clean = normalizeTaxId(parsed.data.taxId);
  if (!isValidTaxId(clean)) return { error: INVALID };

  const db = await createSupabaseServerClient();
  const { error } = await db.rpc('admin_set_tax_id', {
    p_profile_id: parsed.data.profileId,
    p_number: clean,
    p_reason: parsed.data.reason,
  });
  if (error) {
    console.error('[tax-id.correct]', { code: error.code });
    return { error: readable(error) };
  }
  refresh();
  return { ok: 'Documento corrigido. A correção ficou registrada na auditoria.' };
}
