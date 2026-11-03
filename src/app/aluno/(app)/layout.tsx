import './mar-profundo.css';

import { signOut } from '@/app/actions/auth';
import { StudentShell } from '@/components/shells';
import { getViewer } from '@/lib/auth';
import { initials } from '@/lib/people';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Explore and policies are public; every other student page calls requireRole. */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  // Signed storage URL is scoped to the logged-in student, not publicly exposed.
  // If the avatar was never uploaded or Storage is unavailable, use initials.
  let photoUrl: string | null = null;
  if (viewer?.role === 'student') {
    try {
      const db = await createSupabaseServerClient();
      const { data: profile, error } = await db.from('student_private_profiles')
        .select('avatar_path').eq('id', viewer.id)
        .maybeSingle<{ avatar_path: string | null }>();
      if (!error && profile?.avatar_path) {
        const image = await db.storage.from('vento-student-avatars')
          .createSignedUrl(profile.avatar_path, 60 * 60);
        photoUrl = image.data?.signedUrl ?? null;
      }
    } catch (error) {
      console.warn('[student.header-avatar]', error instanceof Error ? error.name : 'unknown');
    }
  }
  return (
    <StudentShell name={viewer?.fullName || 'Visitante'} initials={initials(viewer?.fullName)}
      signedIn={Boolean(viewer)} photoUrl={photoUrl} signOut={signOut}>
      {children}
    </StudentShell>
  );
}
