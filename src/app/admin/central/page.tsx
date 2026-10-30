import type { Metadata } from 'next';

import { Hub } from '@/components/shared';
import { DEMO_NOTICE } from '@/data/demo';

export const metadata: Metadata = { title: 'Central de operação' };

const ITEMS = [
  { title: 'Pousadas afiliadas', body: 'Aprovação, indicações e comissões.', href: '/admin/afiliados' },
  { title: 'Transporte de apoio', body: 'Frota, capacidade, tarifa e apoio por encontro.', href: '/admin/transporte' },
  { title: 'Agenda de aulas', body: 'Dia, semana, mês e lista com filtros.', href: '/admin/agenda' },
  { title: 'Analisar ocorrências', body: 'Liberar saldo ou registrar reembolso de teste.', href: '/admin/ocorrencias' },
  { title: 'Validar documentos', body: 'Aprovar ou pedir correções.', href: '/admin/documentos' },
  { title: 'Praias', body: 'Cadastro das praias e quem atende em cada uma.', href: '/admin/praias' },
  { title: 'Pontos de encontro', body: 'Referência e endereço do mapa.', href: '/admin/pontos' },
  { title: 'Políticas comerciais', body: 'Rascunho das decisões da operação.', href: '/admin/politicas' },
  { title: 'Atendimento', body: 'Acompanhar conversas por encontro.', href: '/admin/atendimento' },
  { title: 'Avisos da operação', body: 'Eventos compartilhados.', href: '/admin/avisos' },
  { title: 'Estrutura da plataforma', body: 'Mapa do que é simulável e do que depende de integração.', href: '/admin/estrutura' },
] as const;

export default function AdminHubPage() {
  return <Hub title="Central de operação" items={ITEMS} notice={DEMO_NOTICE} />;
}
