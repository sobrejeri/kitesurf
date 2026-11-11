import { signOut } from '@/app/actions/auth';
import { WorkspaceShell } from '@/components/shells';
import { AFFILIATE_NAV } from '@/components/workspace-nav';
import { areaLinksFor } from '@/lib/areas';
import { requireRole } from '@/lib/auth';
import { getOwnPartner } from '@/lib/data';
import { initials } from '@/lib/people';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Affiliate workspace (formerly the Pousada app): the same professional shell
 * as Instrutor and Admin. The account is still a `partner` in the database.
 */
export default async function AffiliateLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireRole(['partner'], '/afiliado/inicio');
  const partner = await getOwnPartner(viewer.id);
  const name = partner?.name ?? viewer.fullName;
  const db = await createSupabaseServerClient();
  let photoUrl: string | null = null;
  // Before migration 22, the private table may not yet exist; keep the app usable.
  const { data: photo, error: profileError } = await db.from('partner_private_profiles')
    .select('avatar_path').eq('id', viewer.id)
    .maybeSingle<{ avatar_path: string | null }>();
  if (profileError) {
    console.warn('[partner.layout.avatar]', { code: profileError.code });
  } else if (photo?.avatar_path) {
    const signed = await db.storage.from('vento-partner-avatars')
      .createSignedUrl(photo.avatar_path, 3600);
    photoUrl = signed.data?.signedUrl ?? null;
  }
  return (
    <WorkspaceShell
      signOut={signOut}
      areas={areaLinksFor(viewer.role)}
      workspace="ÁREA DO AFILIADO"
      brandSubtitle="Afiliado"
      nav={AFFILIATE_NAV}
      person={{
        name,
        initials: initials(name),
        role: 'Afiliado VentoKite',
        photoUrl,
        profileHref: '/afiliado/perfil',
      }}
    >
      {children}
    </WorkspaceShell>
  );
}
