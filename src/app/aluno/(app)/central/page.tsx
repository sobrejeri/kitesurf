import type { Metadata } from 'next';

import { StudentHero } from '@/components/student/sunset';

import { Hub } from '@/components/shared';

export const metadata: Metadata = { title: 'Central de aulas' };

const ITEMS = [
  { title: 'Minhas aulas', body: 'Encontros, presença e saldo.', href: '/aluno/aulas' },
  { title: 'Alterações e imprevistos', body: 'Vento, cancelamento e ausências.', href: '/aluno/ocorrencias' },
  { title: 'Conversas e suporte', body: 'Chat com o instrutor após a confirmação da aula.', href: '/aluno/atendimento' },
  { title: 'Meus avisos', body: 'Solicitações, aulas e mensagens.', href: '/aluno/avisos' },
  { title: 'Regras das aulas', body: 'Entenda o fluxo antes de reservar.', href: '/aluno/politicas' },
  { title: 'Conta e acesso', body: 'Confira sua conta, edite o perfil ou encerre a sessão.', href: '/aluno/acesso' },
] as const;

export default function StudentHubPage() {
  return (
    <>
      <StudentHero eyebrow="Fluxos da plataforma" title="Central de aulas" highlight="aulas" lead="Tudo organizado por etapa, sem perder os dados já preenchidos." compact />
      <Hub bare title="Central de aulas" items={ITEMS} notice="Seus registros ficam vinculados à sua conta. A validação atual não realiza cobranças nem repasses." />
    </>
  );
}
