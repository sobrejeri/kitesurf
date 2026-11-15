import type { IconName } from '@/components/icon';

export interface BusinessNavItem { group: string; label: string; href: string; icon: IconName; tab?: boolean }

/** Only screens that exist are listed; each next block adds its own entries here. */
export const BUSINESS_NAV: readonly BusinessNavItem[] = [
  { group: 'Visão', label: 'Dashboard', href: '/admin/business', icon: 'chart', tab: true },
  { group: 'Empresa', label: 'Unidades', href: '/admin/business/unidades', icon: 'pin', tab: true },
  { group: 'Pessoas', label: 'Funcionários', href: '/admin/business/funcionarios', icon: 'users', tab: true },
  { group: 'Pessoas', label: 'Permissões', href: '/admin/business/permissoes', icon: 'shield' },
  { group: 'Pessoas', label: 'Instrutores', href: '/admin/business/instrutores', icon: 'kite' },
  { group: 'Operação', label: 'Agenda', href: '/admin/business/agenda', icon: 'calendar', tab: true },
  { group: 'Operação', label: 'Reservas presenciais', href: '/admin/business/reservas', icon: 'book' },
  { group: 'Caixa', label: 'Caixa', href: '/admin/business/caixa', icon: 'wallet' },
  { group: 'Caixa', label: 'Movimentações', href: '/admin/business/caixa/movimentacoes', icon: 'list' },
  { group: 'Caixa', label: 'Fechamentos', href: '/admin/business/caixa/fechamentos', icon: 'file' },
  { group: 'Caixa', label: 'Relatórios', href: '/admin/business/relatorios', icon: 'chart' },
  { group: 'Caixa', label: 'Comprovantes térmicos', href: '/admin/business/caixa/comprovantes', icon: 'download' },
  { group: 'Caixa', label: 'Configurações do caixa', href: '/admin/business/caixa/configuracoes', icon: 'settings' },
  { group: 'Financeiro', label: 'Financeiro', href: '/admin/business/financeiro', icon: 'chart' },
  { group: 'Financeiro', label: 'Comissões', href: '/admin/business/financeiro/comissoes', icon: 'users' },
  { group: 'Financeiro', label: 'Pagamentos externos', href: '/admin/business/financeiro/pagamentos', icon: 'file' },
  { group: 'Financeiro', label: 'Relatórios financeiros', href: '/admin/business/financeiro/relatorios/consolidado', icon: 'list' },
  { group: 'Estoque', label: 'Estoque', href: '/admin/business/estoque', icon: 'grid' },
  { group: 'Estoque', label: 'Equipamentos', href: '/admin/business/estoque/equipamentos', icon: 'kite' },
  { group: 'Estoque', label: 'Aluguéis', href: '/admin/business/estoque/alugueis', icon: 'clock' },
  { group: 'Estoque', label: 'Relatórios de estoque', href: '/admin/business/estoque/relatorios', icon: 'file' },
  { group: 'Lojinha', label: 'Lojinha', href: '/admin/business/lojinha', icon: 'star' },
  { group: 'Lojinha', label: 'Pedidos', href: '/admin/business/lojinha/pedidos', icon: 'list' },
  { group: 'Lojinha', label: 'Prévia da vitrine', href: '/admin/business/lojinha/vitrine', icon: 'grid' },
  { group: 'Lojinha', label: 'Cupons', href: '/admin/business/lojinha/cupons', icon: 'wallet' },
  { group: 'Catálogo', label: 'Serviços', href: '/admin/business/servicos', icon: 'book' },
  { group: 'Catálogo', label: 'Preços por unidade', href: '/admin/business/precos', icon: 'wallet' },
  { group: 'Catálogo', label: 'Pacotes e promoções', href: '/admin/business/pacotes', icon: 'star' },
];
