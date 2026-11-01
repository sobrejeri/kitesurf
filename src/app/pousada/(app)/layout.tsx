import { signOut } from '@/app/actions/auth';
import { PartnerShell } from '@/components/shells';
import { areaLinksFor } from '@/lib/areas';
import { requireRole } from '@/lib/auth';
import { getOwnPartner } from '@/lib/data';
import { initials } from '@/lib/people';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireRole(['partner'], '/pousada/inicio');
  const partner = await getOwnPartner(viewer.id);
  const name = partner?.name ?? viewer.fullName;
  const db = await createSupabaseServerClient();
  let photoUrl:string|null=null;
  // Before migration 22, the private table may not yet exist; keep the app usable.
  const {data:photo,error:profileError}=await db.from('partner_private_profiles')
    .select('avatar_path').eq('id',viewer.id)
    .maybeSingle<{avatar_path:string|null}>();
  if(profileError){
    console.warn('[partner.layout.avatar]',{code:profileError.code});
  }else if(photo?.avatar_path){
    const signed=await db.storage.from('vento-partner-avatars')
      .createSignedUrl(photo.avatar_path,3600);
    photoUrl=signed.data?.signedUrl??null;
  }
  return (
    <PartnerShell
      partner={{ name, initials: initials(name), photoUrl }}
      signOut={signOut}
      areas={areaLinksFor(viewer.role)}
    >
      {children}
    </PartnerShell>
  );
}
