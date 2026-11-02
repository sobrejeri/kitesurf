import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * A student can access only the avatar of the instructor on their own booking.
 * Migration 25 validates the relationship again in PostgreSQL and restricts
 * Supabase Storage SELECT to that same single private avatar path.
 * Missing migration, avatar or expired permissions must not crash the page.
 */
export async function getStudentBookingInstructorAvatar(
  bookingId: string,
): Promise<string | null> {
  try {
    const db = await createSupabaseServerClient();
    const { data: path, error } = await db.rpc(
      'get_my_booking_instructor_avatar',
      { p_booking_id: bookingId },
    );
    if (error) {
      console.warn('[student.booking.instructor-avatar.path]', { code: error.code });
      return null;
    }
    if (typeof path !== 'string' ||
      !/^[0-9a-f-]{36}\/avatar\.(jpg|png|webp)$/.test(path)) {
      return null;
    }
    const { data: signed, error: storageError } = await db.storage
      .from('vento-instructor-avatars').createSignedUrl(path, 3600);
    if (storageError || !signed?.signedUrl) {
      console.warn('[student.booking.instructor-avatar.url]', {
        code: storageError?.statusCode,
      });
      return null;
    }
    return signed.signedUrl;
  } catch (cause) {
    console.warn('[student.booking.instructor-avatar.unavailable]', cause);
    return null;
  }
}
