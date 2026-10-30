import { PartnerShell } from '@/components/shells';
import { PARTNER } from '@/data/demo';

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return <PartnerShell partner={{ name: PARTNER.name, initials: PARTNER.initials }}>{children}</PartnerShell>;
}
