import { signOut } from '@/app/actions/auth';
import { WorkspaceShell, type WorkspaceNavItem } from '@/components/shells';
import { areaLinksFor } from '@/lib/areas';
import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const NAV: readonly WorkspaceNavItem[] = [
  { label: 'Central de trabalho', href: '/instrutor/central', icon: 'grid' },
  { label: 'Meu dia', href: '/instrutor/hoje', icon: 'sun', tab: true },
  { label: 'Receber solicitação', href: '/instrutor/solicitacao', icon: 'bell' },
  { label: 'Minha prioridade', href: '/instrutor/fila', icon: 'list', tab: true },
  { label: 'Agenda e bloqueios', href: '/instrutor/agenda', icon: 'calendar' },
  { label: 'Realizar e registrar aula', href: '/instrutor/aula', icon: 'kite', tab: true },
  { label: 'Meu financeiro', href: '/instrutor/financeiro', icon: 'wallet', tab: true },
  { label: 'Meu perfil profissional', href: '/instrutor/cadastro', icon: 'user' },
  { label: 'Dias e turnos', href: '/instrutor/disponibilidade', icon: 'clock', secondary: true },
  { label: 'Meus documentos', href: '/instrutor/documentos', icon: 'file', secondary: true },
  { label: 'Ocorrências', href: '/instrutor/ocorrencias', icon: 'wind', secondary: true },
  { label: 'Conversas', href: '/instrutor/atendimento', icon: 'chat', secondary: true },
  { label: 'Avisos', href: '/instrutor/avisos', icon: 'bell', secondary: true },
  { label: 'Regras das aulas', href: '/instrutor/politicas', icon: 'shield', secondary: true },
];

export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireRole(['instructor'], '/instrutor/hoje');

  // The avatar is private: resolve its signed URL using the instructor session.
  // A missing photo or a Storage error must never block access to the workspace.
  let photoUrl: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
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
      theme="sunset"
      brandSubtitle="Instrutor"
      nav={NAV}
      tip={{
        icon: 'shield',
        title: 'Sua prioridade está guardada',
        body: 'Recusar ou deixar expirar preserva sua posição. A vez é usada após o pagamento.',
      }}
      person={{
        name: viewer.fullName,
        initials: viewer.fullName.split(' ').map((p) => p.charAt(0)).join('').slice(0, 2).toUpperCase(),
        role: 'Instrutor independente',
        photoUrl,
        profileHref: '/instrutor/cadastro',
      }}
    >
      {children}
    </WorkspaceShell>
  );
}
