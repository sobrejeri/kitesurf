import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

type AvatarRow = { student_id: string; avatar_path: string };

export async function getInstructorStudentAvatarUrls(): Promise<Map<string, string>> {
  try {
    const db = await createSupabaseServerClient();
    const { data, error } = await db.rpc('get_my_instructor_student_avatar_paths');
    if (error) {
      console.warn('[instructor.student-photos.paths]', { code: error.code });
      return new Map();
    }
    const rows: AvatarRow[] = Array.isArray(data)
      ? data.filter((row): row is AvatarRow =>
          !!row && typeof row.student_id === 'string' &&
          typeof row.avatar_path === 'string' &&
          /^[0-9a-f-]{36}\/avatar\.(jpg|png|webp)$/.test(row.avatar_path))
      : [];
    const photos = await Promise.all(rows.map(async ({ student_id, avatar_path }) => {
      try {
        const { data: image, error: imageError } = await db.storage
          .from('vento-student-avatars').createSignedUrl(avatar_path, 60 * 30);
        if (imageError || !image?.signedUrl) return null;
        return [student_id, image.signedUrl] as [string, string];
      } catch {
        return null;
      }
    }));
    return new Map(photos.filter((p): p is [string, string] => p !== null));
  } catch (cause) {
    console.warn('[instructor.student-photos.unavailable]', cause);
    return new Map();
  }
}
