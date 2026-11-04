'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import { friendlyError, type ActionState } from './errors';

const Profile = z.strictObject({
  fullName: z.string().trim().min(2).max(120),
  language: z.enum(['Português', 'Inglês', 'Espanhol', 'Francês', 'Alemão', 'Italiano']),
});

/**
 * Name and language only: column grants on profiles allow nothing else, so
 * even a crafted request cannot touch the role.
 */
export async function updateProfile(_prev: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireRole(['student', 'instructor', 'partner']);
  const parsed = Profile.safeParse({ fullName: form.get('fullName'), language: form.get('language') });
  if (!parsed.success) return { error: 'Informe um nome com pelo menos 2 letras.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.fullName, language: parsed.data.language })
    .eq('id', viewer.id);
  if (error) return { error: friendlyError(error) };

  revalidatePath('/', 'layout');
  return { ok: 'Perfil atualizado.' };
}


/** Student avatar photos live in a private bucket, never in a public image URL. */
const STUDENT_AVATAR_BUCKET = 'vento-student-avatars';
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const AVATAR_MIMES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

function validAvatarBytes(bytes: Uint8Array, mime: keyof typeof AVATAR_MIMES) {
  if (mime === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mime === 'image/png') {
    return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  }
  return bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
}

export async function uploadStudentAvatar(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireRole(['student']);
  if (viewer.role !== 'student') return { error: 'Apenas o aluno pode alterar esta foto.' };
  const file = form.get('avatar');
  if (!(file instanceof File) || file.size === 0) return { error: 'Selecione uma foto.' };
  if (file.size > MAX_AVATAR_BYTES) return { error: 'Escolha uma imagem de até 3 MB.' };
  if (!(file.type in AVATAR_MIMES)) return { error: 'Utilize uma foto JPG, PNG ou WebP.' };

  try {
    const mime = file.type as keyof typeof AVATAR_MIMES;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validAvatarBytes(bytes, mime)) return { error: 'O arquivo selecionado não é uma imagem válida.' };

    const supabase = await createSupabaseServerClient();
    const { data: studentProfile, error: tableError } = await supabase.from('student_private_profiles')
      .select('id').eq('id', viewer.id).maybeSingle();
    if (tableError) {
      console.error('[student-avatar] Private profile lookup failed', {
        code: tableError.code, message: tableError.message,
      });
      return { error: 'As fotos dos alunos ainda não estão disponíveis. Atualize o Supabase.' };
    }

    const path = viewer.id + '/avatar.' + AVATAR_MIMES[mime];
    const { error: uploadError } = await supabase.storage.from(STUDENT_AVATAR_BUCKET)
      .upload(path, bytes, { contentType: mime, cacheControl: '60', upsert: true });
    if (uploadError) {
      console.error('[student-avatar] Upload failed', { message: uploadError.message });
      return { error: 'Não foi possível enviar sua foto. Tente novamente.' };
    }

    const avatarFields = { avatar_path: path, updated_at: new Date().toISOString() };
    const { error: saveError } = studentProfile
      ? await supabase.from('student_private_profiles').update(avatarFields).eq('id', viewer.id)
      : await supabase.from('student_private_profiles').insert({ id: viewer.id, ...avatarFields });
    if (saveError) {
      console.error('[student-avatar] Path update failed', {
        code: saveError.code, message: saveError.message,
      });
      return { error: 'A foto foi enviada, mas não foi possível atualizar seu perfil.' };
    }

    revalidatePath('/aluno', 'layout');
    return { ok: 'Foto do perfil atualizada.' };
  } catch (error) {
    console.error('[student-avatar] Unexpected error', error);
    return { error: 'Não foi possível atualizar sua foto agora. Tente novamente.' };
  }
}


/** Update only the student's own declared level. Instructor assessments stay intact. */
export async function updateMyKiteLevel(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['student']);
  const parsed = z.enum(['first_time','returning','improving']).safeParse(form.get('kiteLevel'));
  if (!parsed.success) return { error: 'Escolha Iniciante, Intermediário ou Avançado.' };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc('set_my_kite_level', { p_level: parsed.data });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/aluno/conta');
  revalidatePath('/aluno/evolucao');
  revalidatePath('/aluno/inicio');
  revalidatePath('/aluno/reservar');
  return { ok: 'Seu nível informado foi atualizado. Avaliações do instrutor permanecem registradas.' };
}
