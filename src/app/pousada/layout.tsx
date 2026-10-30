import { PartnerShell } from '@/components/shells';
import { requireRole } from '@/lib/auth';
import { getOwnPartner } from '@/lib/data';
import { initials } from '@/lib/people';

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireRole(['partner'], '/pousada/inicio');
  const partner = await getOwnPartner(viewer.id);
  const name = partner?.name ?? viewer.fullName;
  return <PartnerShell partner={{ name, initials: initials(name) }}>{children}</PartnerShell>;
}
