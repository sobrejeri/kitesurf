import type { Metadata } from 'next';

import { BusinessShell } from '@/components/business/shell';
import { requireRole } from '@/lib/auth';
import { initials } from '@/lib/people';

export const metadata: Metadata = { title: { default: 'VentoKite Business', template: '%s · Business' } };

/**
 * VentoKite Business (preview). There are no company accounts or tables yet,
 * so it is reachable only by the platform Admin, with the same second-factor
 * rule as the rest of Admin, and shows demonstration data.
 */
export default async function BusinessLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireRole(['admin'], '/admin/business');
  const name = viewer.fullName || 'Equipe Vento';
  return <BusinessShell person={{ name, initials: initials(name) }}>{children}</BusinessShell>;
}
