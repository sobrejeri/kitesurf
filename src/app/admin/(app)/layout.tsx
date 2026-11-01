import { signOut } from '@/app/actions/auth';
import { WorkspaceShell, type WorkspaceNavItem } from '@/components/shells';
import { areaLinksFor } from '@/lib/areas';
import { requireRole } from '@/lib/auth';

const NAV: readonly WorkspaceNavItem[] = [
  { label: 'Mais opções', href: '/admin/central', icon: 'grid' },
  { label: 'Agenda de aulas', href: '/admin/agenda', icon: 'calendar' },
  { label: 'Criar aula teste', href: '/admin/aula-teste', icon: 'kite', secondary: true },
  { label: 'Visão geral', href: '/admin/visao', icon: 'chart', tab: true },
  { label: 'Fila e distribuição', href: '/admin/distribuicao', icon: 'list' },
  { label: 'Instrutores', href: '/admin/instrutores', icon: 'users', tab: true },
  { label: 'Reservas', href: '/admin/reservas', icon: 'book', tab: true },
  { label: 'Financeiro', href: '/admin/financeiro', icon: 'wallet', tab: true },
  { label: 'Praias', href: '/admin/praias', icon: 'pin' },
  { label: 'Regras da operação', href: '/admin/regras', icon: 'sliders' },
  { label: 'Pousadas afiliadas', href: '/admin/afiliados', icon: 'home', secondary: true },
  { label: 'Transporte de apoio', href: '/admin/transporte', icon: 'car', secondary: true },
  { label: 'Analisar ocorrências', href: '/admin/ocorrencias', icon: 'wind', secondary: true },
  { label: 'Validar documentos', href: '/admin/documentos', icon: 'file', secondary: true },
  { label: 'Pontos de encontro', href: '/admin/pontos', icon: 'pin', secondary: true },
  { label: 'Políticas comerciais', href: '/admin/politicas', icon: 'shield', secondary: true },
  { label: 'Atendimento', href: '/admin/atendimento', icon: 'chat', secondary: true },
  { label: 'Avisos da operação', href: '/admin/avisos', icon: 'bell', secondary: true },
  { label: 'Estrutura da plataforma', href: '/admin/estrutura', icon: 'settings', secondary: true },
  { label: 'Configurações', href: '/admin/configuracoes', icon: 'settings' },
  { label: 'Auditoria', href: '/admin/auditoria', icon: 'list', secondary: true },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireRole(['admin'], '/admin/visao');
  return (
    <WorkspaceShell
      signOut={signOut}
      areas={areaLinksFor(viewer.role)}
      workspace="ADMINISTRAÇÃO"
      theme="sunset"
      brandSubtitle="Admin"
      nav={NAV}
      tip={{
        icon: 'wind',
        title: 'Uma operação mais clara',
        body: 'Acompanhe cada oferta, reserva e mudança da fila em um só lugar.',
      }}
      person={{ name: viewer.fullName || 'Equipe Vento', initials: 'EV', role: 'Operação da plataforma' }}
    >
      {children}
    </WorkspaceShell>
  );
}
