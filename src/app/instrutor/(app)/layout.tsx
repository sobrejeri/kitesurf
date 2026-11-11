import { signOut } from '@/app/actions/auth';
import { WorkspaceShell } from '@/components/shells';
import { INSTRUCTOR_NAV } from '@/components/workspace-nav';
import { areaLinksFor } from '@/lib/areas';
import { requireRole } from '@/lib/auth';
import { FloatingChat } from '@/components/floating-chat';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireRole(['instructor'], '/instrutor/hoje');

  // The avatar is private: resolve its signed URL using the instructor session.
  // A missing photo or a Storage error must never block access to the workspace.
  let photoUrl: string | null = null;
  let unreadCount = 0;
  try {
    const supabase = await createSupabaseServerClient();
    const { count, error: notificationError } = await supabase
      .from('app_notifications').select('id',{count:'exact',head:true})
      .eq('recipient_id',viewer.id).is('read_at',null);
    if (!notificationError) unreadCount=count??0;
    const { data: profile, error: profileError } = await supabase
      .from('instructor_private_profiles')
      .select('avatar_path')
      .eq('id', viewer.id)
      .maybeSingle<{ avatar_path: string | null }>();
    if (profileError) {
      console.warn('[instructor-header] Avatar metadata unavailable', { code: profileError.code });
    } else if (profile?.avatar_path) {
      const { data, error } = await supabase.storage
        .from('vento-instructor-avatars')
        .createSignedUrl(profile.avatar_path, 60 * 60);
      if (error) {
        console.warn('[instructor-header] Avatar unavailable', { message: error.message });
      } else {
        photoUrl = data?.signedUrl ?? null;
      }
    }
  } catch (error) {
    console.error('[instructor-header] Could not load avatar', error);
  }

  return (
    <WorkspaceShell
      signOut={signOut}
      areas={areaLinksFor(viewer.role)}
      workspace="ESPAÇO DO INSTRUTOR"
      brandSubtitle="Instrutor"
      nav={INSTRUCTOR_NAV}
      person={{
        name: viewer.fullName,
        initials: viewer.fullName.split(' ').map((p) => p.charAt(0)).join('').slice(0, 2).toUpperCase(),
        role: 'Instrutor independente',
        photoUrl,
        profileHref: '/instrutor/cadastro',
        unreadCount,
      }}
    >
      {children}
      {viewer.role === 'instructor' ? <FloatingChat key={viewer.id} area="instrutor" viewerId={viewer.id}/> : null}
    </WorkspaceShell>
  );
}
