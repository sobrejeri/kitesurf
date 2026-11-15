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
  { group: 'Catálogo', label: 'Serviços', href: '/admin/business/servicos', icon: 'book' },
  { group: 'Catálogo', label: 'Preços por unidade', href: '/admin/business/precos', icon: 'wallet' },
  { group: 'Catálogo', label: 'Pacotes e promoções', href: '/admin/business/pacotes', icon: 'star' },
];
