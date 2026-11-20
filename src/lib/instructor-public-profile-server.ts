import { createSupabaseServerClient } from '@/lib/supabase/server';
import { parseInstructorPublicProfile, type InstructorPublicProfile } from '@/lib/instructor-public-profile';

/** Student-only: the database refuses unless the viewer has a booking with this instructor. */
export async function getInstructorPublicProfile(instructorId: string): Promise<InstructorPublicProfile | null> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.rpc('get_instructor_public_profile', { p_instructor_id: instructorId });
  if (error) {
    console.warn('[student.instructor-profile]', { code: error.code });
    return null;
  }
  return parseInstructorPublicProfile(data);
}
