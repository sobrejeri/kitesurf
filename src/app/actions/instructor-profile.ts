'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import { friendlyError, type ActionState } from './errors';

const MISSING_SETUP = 'O cadastro completo ainda não foi habilitado no Supabase. A administração precisa instalar a migração do perfil do instrutor.';

function schemaError(error: { code?: string; message?: string }) {
  return error.code === 'PGRST205' || error.code === '42P01' ||
    (error.code === 'PGRST204' && /instructor_private_profiles|instructor_payout_details/i.test(error.message ?? ''));
}

function describeError(error: { code?: string; message?: string }) {
  return schemaError(error) ? MISSING_SETUP : friendlyError(error);
}

const Personal = z.strictObject({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(20).regex(/^[+0-9\s().-]*$/),
  city: z.string().trim().max(80),
  bio: z.string().trim().max(500),
});

export async function saveInstructorPersonal(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireRole(['instructor']);
  if (viewer.role !== 'instructor') return { error: 'Apenas o instrutor pode editar seus dados.' };
  const parsed = Personal.safeParse({
    fullName: form.get('fullName'),
    phone: form.get('phone'),
    city: form.get('city'),
    bio: form.get('bio'),
  });
  if (!parsed.success) return { error: 'Confira nome, telefone, cidade e apresentação.' };

  const supabase = await createSupabaseServerClient();
  // Column-level privileges intentionally forbid changing the primary key.
  // An UPSERT would attempt an UPDATE of id and fail with 42501.
  const { data: existing, error: readError } = await supabase
    .from('instructor_private_profiles').select('id').eq('id', viewer.id).maybeSingle();
  if (readError) return { error: describeError(readError) };

  const fields = {
    phone: parsed.data.phone,
    city: parsed.data.city,
    bio: parsed.data.bio,
    updated_at: new Date().toISOString(),
  };
  const { error } = existing
    ? await supabase.from('instructor_private_profiles').update(fields).eq('id', viewer.id)
    : await supabase.from('instructor_private_profiles').insert({ id: viewer.id, ...fields });
  if (error) {
    console.error('[instructor-personal] Save failed', { code: error.code, message: error.message });
    return { error: describeError(error) };
  }

  const profileResult = await supabase.from('profiles')
    .update({ full_name: parsed.data.fullName }).eq('id', viewer.id);
  if (profileResult.error) return { error: friendlyError(profileResult.error) };

  revalidatePath('/instrutor', 'layout');
  revalidatePath('/instrutor/cadastro');
  return { ok: 'Informações pessoais atualizadas.' };
}

const Payout = z.strictObject({
  method: z.enum(['pix', 'bank']),
  holderName: z.string().trim().min(2).max(120),
  pixKey: z.string().trim().max(140),
  bankName: z.string().trim().max(100),
  branch: z.string().trim().max(30),
  accountNumber: z.string().trim().max(40),
  accountType: z.enum(['checking', 'savings']),
});

export async function saveInstructorPayout(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireRole(['instructor']);
  if (viewer.role !== 'instructor') return { error: 'Apenas o instrutor pode cadastrar seu recebimento.' };
  const parsed = Payout.safeParse({
    method: form.get('method'), holderName: form.get('holderName'),
    pixKey: form.get('pixKey') ?? '', bankName: form.get('bankName') ?? '',
    branch: form.get('branch') ?? '', accountNumber: form.get('accountNumber') ?? '',
    accountType: form.get('accountType') ?? 'checking',
  });
  if (!parsed.success) return { error: 'Confira os dados de recebimento.' };
  const p = parsed.data;
  if (p.method === 'pix' && p.pixKey.length < 5) return { error: 'Informe uma chave Pix válida.' };
  if (p.method === 'bank' && (!p.bankName || !p.branch || !p.accountNumber)) {
    return { error: 'Informe banco, agência e número da conta.' };
  }

  const supabase = await createSupabaseServerClient();
  const supabaseRead = await supabase.from('instructor_payout_details')
    .select('id').eq('id', viewer.id).maybeSingle();
  if (supabaseRead.error) return { error: describeError(supabaseRead.error) };

  const payoutFields = {
    method: p.method,
    holder_name: p.holderName,
    pix_key: p.method === 'pix' ? p.pixKey : null,
    bank_name: p.method === 'bank' ? p.bankName : null,
    branch: p.method === 'bank' ? p.branch : null,
    account_number: p.method === 'bank' ? p.accountNumber : null,
    account_type: p.method === 'bank' ? p.accountType : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = supabaseRead.data
    ? await supabase.from('instructor_payout_details').update(payoutFields).eq('id', viewer.id)
    : await supabase.from('instructor_payout_details').insert({ id: viewer.id, ...payoutFields });
  if (error) {
    console.error('[instructor-payout] Save failed', { code: error.code, message: error.message });
    return { error: describeError(error) };
  }

  revalidatePath('/instrutor/cadastro');
  return { ok: 'Dados de recebimento armazenados. Eles ainda não habilitam repasses automáticos.' };
}

const AVATAR_BUCKET = 'vento-instructor-avatars';
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_FORMATS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

function hasValidImageSignature(bytes: Uint8Array, mime: keyof typeof IMAGE_FORMATS): boolean {
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') return bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v);
  return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
}

export async function uploadInstructorAvatar(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireRole(['instructor']);
  if (viewer.role !== 'instructor') return { error: 'Apenas o instrutor pode alterar sua foto.' };
  const candidate = form.get('avatar');
  if (!(candidate instanceof File) || candidate.size === 0) return { error: 'Selecione uma imagem.' };
  if (candidate.size > MAX_IMAGE_BYTES) return { error: 'A imagem deve ter no máximo 3 MB.' };
  if (!(candidate.type in IMAGE_FORMATS)) return { error: 'Use uma foto JPG, PNG ou WebP.' };

  try {
    const mime = candidate.type as keyof typeof IMAGE_FORMATS;
    const bytes = new Uint8Array(await candidate.arrayBuffer());
    if (!hasValidImageSignature(bytes, mime)) return { error: 'O arquivo não é uma imagem válida.' };

    const supabase = await createSupabaseServerClient();
    // Check that storage metadata can be written before uploading the image.
    const { data: profileRow, error: profileError } = await supabase.from('instructor_private_profiles')
      .select('id').eq('id', viewer.id).maybeSingle();
    if (profileError) {
      console.error('[instructor-avatar] Profile lookup failed', {
        code: profileError.code, message: profileError.message,
      });
      return { error: describeError(profileError) };
    }

    const path = viewer.id + '/avatar.' + IMAGE_FORMATS[mime];
    const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET)
      .upload(path, bytes, { contentType: mime, upsert: true, cacheControl: '60' });
    if (uploadError) {
      console.error('[instructor-avatar] Storage upload failed', {
        statusCode: uploadError.statusCode, message: uploadError.message,
      });
      return { error: 'Não foi possível enviar a foto. Verifique a configuração do armazenamento e as permissões no Supabase.' };
    }

    const avatarFields = { avatar_path: path, updated_at: new Date().toISOString() };
    const { error: saveError } = profileRow
      ? await supabase.from('instructor_private_profiles').update(avatarFields).eq('id', viewer.id)
      : await supabase.from('instructor_private_profiles').insert({ id: viewer.id, ...avatarFields });
    if (saveError) {
      console.error('[instructor-avatar] Avatar path save failed', {
        code: saveError.code, message: saveError.message,
      });
      return { error: describeError(saveError) };
    }

    revalidatePath('/instrutor/cadastro');
    return { ok: 'Foto do perfil atualizada.' };
  } catch (error) {
    console.error('[instructor-avatar] Unexpected upload error', error);
    return { error: 'O envio não foi concluído. Tente novamente com uma foto JPG, PNG ou WebP de até 3 MB.' };
  }
}
