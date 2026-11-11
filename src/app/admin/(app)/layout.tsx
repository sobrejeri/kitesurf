import { signOut } from '@/app/actions/auth';
import { WorkspaceShell } from '@/components/shells';
import { ADMIN_NAV } from '@/components/workspace-nav';
import { areaLinksFor } from '@/lib/areas';
import { requireRole } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireRole(['admin'], '/admin/visao');
  return (
    <WorkspaceShell
      signOut={signOut}
      areas={areaLinksFor(viewer.role)}
      workspace="ADMINISTRAÇÃO"
      brandSubtitle="Admin"
      nav={ADMIN_NAV}
      person={{ name: viewer.fullName || 'Equipe Vento', initials: 'EV', role: 'Operação da plataforma' }}
    >
      {children}
    </WorkspaceShell>
  );
}
