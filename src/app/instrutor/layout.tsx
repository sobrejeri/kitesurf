import { WorkspaceShell, type WorkspaceNavItem } from '@/components/shells';
import { INSTRUCTOR } from '@/data/demo';

const NAV: readonly WorkspaceNavItem[] = [
  { label: 'Central de trabalho', href: '/instrutor/central', icon: 'grid' },
  { label: 'Meu dia', href: '/instrutor/hoje', icon: 'sun' },
  { label: 'Receber solicitação', href: '/instrutor/solicitacao', icon: 'bell' },
  { label: 'Minha prioridade', href: '/instrutor/fila', icon: 'list' },
  { label: 'Agenda e bloqueios', href: '/instrutor/agenda', icon: 'calendar' },
  { label: 'Realizar e registrar aula', href: '/instrutor/aula', icon: 'kite' },
  { label: 'Meu financeiro', href: '/instrutor/financeiro', icon: 'wallet' },
  { label: 'Meu perfil profissional', href: '/instrutor/perfil', icon: 'user' },
  { label: 'Cadastro de instrutor', href: '/instrutor/cadastro', icon: 'plus' },
  { label: 'Dias e turnos', href: '/instrutor/disponibilidade', icon: 'clock', secondary: true },
  { label: 'Meus documentos', href: '/instrutor/documentos', icon: 'file', secondary: true },
  { label: 'Ocorrências', href: '/instrutor/ocorrencias', icon: 'wind', secondary: true },
  { label: 'Conversas', href: '/instrutor/atendimento', icon: 'chat', secondary: true },
  { label: 'Avisos', href: '/instrutor/avisos', icon: 'bell', secondary: true },
  { label: 'Regras das aulas', href: '/instrutor/politicas', icon: 'shield', secondary: true },
];

export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceShell
      workspace="ESPAÇO DO INSTRUTOR"
      nav={NAV}
      tip={{
        icon: 'shield',
        title: 'Sua prioridade está guardada',
        body: 'Recusar ou deixar expirar preserva sua posição. A vez é usada após o pagamento.',
      }}
      person={{ name: INSTRUCTOR.name, initials: INSTRUCTOR.initials, role: INSTRUCTOR.role }}
    >
      {children}
    </WorkspaceShell>
  );
}
