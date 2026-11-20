import type { Metadata } from 'next';

import { LegalPage } from '@/components/legal-page';

export const metadata: Metadata = { title: 'Termos de uso' };

export default function TermsPage() {
  return (
    <LegalPage title="Termos de uso" updated="20/11/2026" other={{ href: '/privacidade', label: 'Política de privacidade' }}
      sections={[
        { title: 'O que é o Vento', body: ['O Vento é uma plataforma que conecta alunos a instrutores independentes de kitesurf em Preá e Jericoacoara. O Vento organiza reservas, agenda, fila de instrutores, registro de aulas e atendimento; a aula em si é prestada pelo instrutor.'] },
        { title: 'Contas e perfis', body: ['Há quatro perfis: aluno, instrutor, afiliado e administrador. Cada perfil acessa apenas a sua área. Contas de administrador são criadas pela operação e nunca por autocadastro.', 'Instrutores e afiliados informam CPF ou CNPJ e, no caso dos instrutores, documentos que a operação aprova antes de liberar o atendimento. Você é responsável pela veracidade das informações e por manter sua senha segura.'] },
        { title: 'Reservas, preços e prazos', body: ['Os valores são calculados pelo sistema a partir da tabela de preços vigente no momento da reserva e ficam congelados nela. Uma mudança de preço vale apenas para reservas novas.', 'A aula pode começar até 24 horas antes do horário agendado, desde que os encontros anteriores da mesma reserva estejam concluídos. Reagendamentos, cancelamentos e respostas seguem os prazos exibidos no aplicativo.'] },
        { title: 'Pagamentos', body: ['Nesta fase, as cobranças reais estão desativadas e o pagamento exibido é apenas simulado para testes. Quando a cobrança real for ativada, estes termos serão atualizados antes.'] },
        { title: 'Segurança e ocorrências', body: ['Siga as orientações do instrutor e as regras de segurança exibidas em "Políticas". Qualquer ocorrência pode ser relatada no aplicativo e será analisada pela operação. O relato não altera valores nem saldo automaticamente.'] },
        { title: 'Uso adequado', body: ['Não é permitido tentar acessar dados de outras pessoas, contornar permissões, enviar conteúdo ilegal ou ofensivo, nem usar a plataforma para fins diferentes das aulas. A operação pode suspender contas que violem estes termos.'] },
        { title: 'Contato e alterações', body: ['Dúvidas ou pedidos podem ser feitos pela Central do aplicativo. Estes termos podem mudar; a data de atualização aparece no topo desta página.'] },
      ]} />
  );
}
