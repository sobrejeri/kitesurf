import { WorkspaceShell, type WorkspaceNavItem } from '@/components/shells';
import { requireRole } from '@/lib/auth';

const NAV: readonly WorkspaceNavItem[] = [
  { label: 'Central de trabalho', href: '/instrutor/central', icon: 'grid' },
  { label: 'Meu dia', href: '/instrutor/hoje', icon: 'sun' },
  { label: 'Receber solicitação', href: '/instrutor/solicitacao', icon: 'bell' },
  { label: 'Minha prioridade', href: '/instrutor/fila', icon: 'list' },
  { label: 'Agenda e bloqueios', href: '/instrutor/agenda', icon: 'calendar' },
  { label: 'Realizar e registrar aula', href: '/instrutor/aula', icon: 'kite' },
  { label: 'Meu financeiro', href: '/instrutor/financeiro', icon: 'wallet' },
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
  return (
    <WorkspaceShell
      workspace="ESPAÇO DO INSTRUTOR"
      nav={NAV}
      tip={{
        icon: 'shield',
        title: 'Sua prioridade está guardada',
        body: 'Recusar ou deixar expirar preserva sua posição. A vez é usada após o pagamento.',
      }}
      person={{ name: viewer.fullName, initials: viewer.fullName.split(' ').map((p) => p.charAt(0)).join('').slice(0, 2).toUpperCase(), role: 'Instrutor independente' }}
    >
      {children}
    </WorkspaceShell>
  );
}
