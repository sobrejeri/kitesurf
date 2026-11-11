import type { Metadata } from 'next';

import { DesktopPageHeader } from '@/components/student/desktop-page-header';
import { StudentPageTitle } from '@/components/student/page-title';
import { Hub, type HubItem } from '@/components/shared';

export const metadata: Metadata = { title: 'Central de aulas' };

const ITEMS: readonly HubItem[] = [
  { title: 'Minhas aulas', body: 'Encontros, presença e saldo.', href: '/aluno/aulas', icon: 'calendar' },
  { title: 'Alterações e imprevistos', body: 'Vento, cancelamento e ausências.', href: '/aluno/ocorrencias', icon: 'shield' },
  { title: 'Conversas e suporte', body: 'Chat com o instrutor após a confirmação da aula.', href: '/aluno/atendimento', icon: 'chat' },
  { title: 'Meus avisos', body: 'Solicitações, aulas e mensagens.', href: '/aluno/avisos', icon: 'bell' },
  { title: 'Regras das aulas', body: 'Entenda o fluxo antes de reservar.', href: '/aluno/politicas', icon: 'book' },
  { title: 'Conta e acesso', body: 'Seus dados, foto, senha e saída da conta.', href: '/aluno/conta', icon: 'user' },
];

export default function StudentHubPage() {
  return (
    <div className="vento-pc-secondary-page vento-pc-central-screen vento-mobile-appbar-clearance">
      <DesktopPageHeader eyebrow="CENTRAL DE ATENDIMENTO"
        title="Central de aulas"
        lead="Tudo que você precisa para acompanhar suas aulas e encontrar ajuda."
        icon="grid"
        backHref="/aluno/inicio" variant="lesson"/>
      <div className="vento-pc-secondary-main">
        <StudentPageTitle title="Central de aulas" subtitle="Suas aulas, conversas, avisos e ajuda"/>
        <Hub bare title="Central de aulas" items={ITEMS} notice="Seus registros ficam vinculados à sua conta. A validação atual não realiza cobranças nem repasses." />
      </div>
    </div>
  );
}
