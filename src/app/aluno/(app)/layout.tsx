import './mar-profundo.css';

import { signOut } from '@/app/actions/auth';
import { StudentShell } from '@/components/shells';
import { getViewer } from '@/lib/auth';
import { initials } from '@/lib/people';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Explore and policies are public; every other student page calls requireRole. */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  let photoUrl: string | null = null;
  if (viewer?.role === 'student') {
    try {
      const db = await createSupabaseServerClient();
      const { data: profile } = await db.from('student_private_profiles')
        .select('avatar_path').eq('id', viewer.id)
        .maybeSingle<{ avatar_path: string | null }>();
      if (profile?.avatar_path) {
        const { data } = await db.storage.from('vento-student-avatars')
          .createSignedUrl(profile.avatar_path, 3600);
        photoUrl = data?.signedUrl ?? null;
      }
    } catch (error) {
      console.warn('[student.desktop-avatar] Could not load photo', error);
    }
  }
  const name = viewer ? viewer.fullName?.trim() || 'Aluno' : 'Visitante';
  return (
    <StudentShell name={name} initials={initials(name)} photoUrl={photoUrl} signedIn={Boolean(viewer)} signOut={signOut}>
      {children}
    </StudentShell>
  );
}
