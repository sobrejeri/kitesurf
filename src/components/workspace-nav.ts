import type { WorkspaceNavItem } from './shells';

/**
 * Every page of the workspaces (Instrutor, Admin, Afiliado), in menu order. One list feeds the
 * sidebar, the phone tab bar ("tab"), the "Mais" sheet and each area's hub
 * page, so a page added here shows up everywhere at once. Listing a page is
 * presentation only: each route still checks the role on the server.
 */
export const INSTRUCTOR_NAV: readonly WorkspaceNavItem[] = [
  { group: 'Trabalho', label: 'Meu dia', href: '/instrutor/hoje', icon: 'sun', tab: true },
  { group: 'Trabalho', label: 'Receber solicitação', href: '/instrutor/solicitacao', icon: 'bell' },
  { group: 'Trabalho', label: 'Realizar e registrar aula', href: '/instrutor/aula', icon: 'kite', tab: true },
  { group: 'Trabalho', label: 'Agenda e bloqueios', href: '/instrutor/agenda', icon: 'calendar' },
  { group: 'Trabalho', label: 'Minha prioridade', href: '/instrutor/fila', icon: 'list', tab: true },
  { group: 'Ganhos', label: 'Meu financeiro', href: '/instrutor/financeiro', icon: 'wallet', tab: true },
  { group: 'Ganhos', label: 'Avaliações', href: '/instrutor/avaliacoes', icon: 'star' },
  { group: 'Cadastro', label: 'Meu perfil profissional', href: '/instrutor/cadastro', icon: 'user' },
  { group: 'Cadastro', label: 'Dias e turnos', href: '/instrutor/disponibilidade', icon: 'clock' },
  { group: 'Cadastro', label: 'Pontos de encontro', href: '/instrutor/pontos', icon: 'pin' },
  { group: 'Cadastro', label: 'Meus documentos', href: '/instrutor/documentos', icon: 'file' },
  { group: 'Suporte', label: 'Conversas', href: '/instrutor/atendimento', icon: 'chat' },
  { group: 'Suporte', label: 'Avisos', href: '/instrutor/avisos', icon: 'bell' },
  { group: 'Suporte', label: 'VentoKite Protege', href: '/instrutor/ocorrencias', icon: 'shield' },
  { group: 'Suporte', label: 'Regras das aulas', href: '/instrutor/politicas', icon: 'book' },
  { group: 'Suporte', label: 'Central de trabalho', href: '/instrutor/central', icon: 'grid' },
];

export const ADMIN_NAV: readonly WorkspaceNavItem[] = [
  { group: 'Operação', label: 'Visão geral', href: '/admin/visao', icon: 'chart', tab: true },
  { group: 'Operação', label: 'Agenda de aulas', href: '/admin/agenda', icon: 'calendar' },
  { group: 'Operação', label: 'Reservas', href: '/admin/reservas', icon: 'book', tab: true },
  { group: 'Operação', label: 'Fila e distribuição', href: '/admin/distribuicao', icon: 'list' },
  { group: 'Operação', label: 'Atendimento', href: '/admin/atendimento', icon: 'chat' },
  { group: 'Operação', label: 'Avisos da operação', href: '/admin/avisos', icon: 'bell' },
  { group: 'Pessoas', label: 'Instrutores', href: '/admin/instrutores', icon: 'users', tab: true },
  { group: 'Pessoas', label: 'Validar documentos', href: '/admin/documentos', icon: 'file' },
  { group: 'Pessoas', label: 'Afiliados', href: '/admin/afiliados', icon: 'link' },
  { group: 'Financeiro', label: 'Financeiro', href: '/admin/financeiro', icon: 'wallet', tab: true },
  { group: 'Financeiro', label: 'Regras da operação', href: '/admin/regras', icon: 'sliders' },
  { group: 'Financeiro', label: 'Políticas comerciais', href: '/admin/politicas', icon: 'book' },
  { group: 'Cadastros', label: 'Praias', href: '/admin/praias', icon: 'pin' },
  { group: 'Cadastros', label: 'Pontos de encontro', href: '/admin/pontos', icon: 'flag' },
  { group: 'Cadastros', label: 'Transporte de apoio', href: '/admin/transporte', icon: 'car' },
  { group: 'Segurança', label: 'VentoKite Protege', href: '/admin/ocorrencias', icon: 'shield' },
  { group: 'Segurança', label: 'Auditoria', href: '/admin/auditoria', icon: 'list' },
  { group: 'Sistema', label: 'Configurações', href: '/admin/configuracoes', icon: 'settings' },
  { group: 'Sistema', label: 'Estrutura da plataforma', href: '/admin/estrutura', icon: 'sliders' },
  { group: 'Sistema', label: 'Criar aula teste', href: '/admin/aula-teste', icon: 'kite' },
  { group: 'Sistema', label: 'Mais opções', href: '/admin/central', icon: 'grid' },
];

export const AFFILIATE_NAV: readonly WorkspaceNavItem[] = [
  { group: 'Indicações', label: 'Início', href: '/afiliado/inicio', icon: 'home', tab: true },
  { group: 'Indicações', label: 'Divulgar', href: '/afiliado/divulgacao', icon: 'link', tab: true },
  { group: 'Indicações', label: 'Minhas indicações', href: '/afiliado/indicacoes', icon: 'chart', tab: true },
  { group: 'Conta', label: 'Meu perfil', href: '/afiliado/perfil', icon: 'user', tab: true },
  { group: 'Conta', label: 'Central do afiliado', href: '/afiliado/central', icon: 'grid' },
];
