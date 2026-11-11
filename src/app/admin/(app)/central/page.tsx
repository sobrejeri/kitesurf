import type { Metadata } from 'next';

import { AdminTitle, HubSections } from '@/components/admin/kit';
import { type IconName } from '@/components/icon';
import { ADMIN_NAV } from '@/components/workspace-nav';
import { requireRole } from '@/lib/auth';

export const metadata: Metadata = { title: 'Mais opções' };

/** Pages reached only from here; the rest comes from the workspace menu. */
const EXTRA: Readonly<Record<string, readonly { label: string; href: string; icon: IconName }[]>> = {
  Pessoas: [{ label: 'Equipe administrativa', href: '/admin/equipe', icon: 'user' }],
  Segurança: [{ label: 'Homologação Protege', href: '/admin/protege-homologacao', icon: 'check' }],
};

export default async function AdminMorePage() {
  await requireRole(['admin'], '/admin/central');
  const titles = [...new Set(ADMIN_NAV.map((item) => item.group))];
  const sections = titles.map((title) => ({
    title,
    items: [
      ...ADMIN_NAV.filter((item) => item.group === title && item.href !== '/admin/central'),
      ...(EXTRA[title] ?? []),
    ],
  }));
  return (
    <>
      <AdminTitle title="Mais opções" subtitle="Tudo da operação em um só lugar, na mesma ordem do menu." />
      <HubSections sections={sections} />
    </>
  );
}
