import { WorkspaceShell, type WorkspaceNavItem } from '@/components/shells';
import { requireRole } from '@/lib/auth';

const NAV: readonly WorkspaceNavItem[] = [
  { label: 'Central de operação', href: '/admin/central', icon: 'grid' },
  { label: 'Agenda de aulas', href: '/admin/agenda', icon: 'calendar' },
  { label: 'Visão geral', href: '/admin/visao', icon: 'chart' },
  { label: 'Fila e distribuição', href: '/admin/distribuicao', icon: 'list' },
  { label: 'Instrutores', href: '/admin/instrutores', icon: 'users' },
  { label: 'Reservas', href: '/admin/reservas', icon: 'book' },
  { label: 'Financeiro', href: '/admin/financeiro', icon: 'wallet' },
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
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireRole(['admin'], '/admin/visao');
  return (
    <WorkspaceShell
      workspace="ADMINISTRAÇÃO"
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
