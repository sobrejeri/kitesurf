import type { Metadata } from 'next';

import { LegalPage } from '@/components/legal-page';

export const metadata: Metadata = { title: 'Política de privacidade' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidade" updated="20/11/2026" other={{ href: '/termos', label: 'Termos de uso' }}
      sections={[
        { title: 'Quais dados coletamos', body: ['Dados de cadastro (nome, e-mail, telefone), foto de perfil, nível e idioma das aulas, reservas e presença nos encontros, mensagens trocadas no chat da reserva e relatos de ocorrência.', 'Para instrutores e afiliados: CPF ou CNPJ e, para instrutores, documentos de identificação e certificação. Esses arquivos ficam em armazenamento privado e só são abertos por links temporários para quem tem permissão.'] },
        { title: 'Para que usamos', body: ['Para criar e operar sua conta, organizar reservas e a fila de instrutores, registrar aulas e evolução, permitir o atendimento e a segurança, e gerar comissões de afiliados. Não vendemos seus dados.'] },
        { title: 'Quem pode ver', body: ['O aluno vê as próprias reservas e a evolução; o instrutor vê as reservas que atende; o afiliado vê as indicações feitas por ele; a equipe de administração acessa o necessário para operar e dar suporte, com registro de auditoria nas ações administrativas. Documentos do instrutor não são visíveis a alunos nem a outros instrutores.'] },
        { title: 'Pagamentos', body: ['Nesta fase não há cobrança real e nenhum dado de cartão é coletado.'] },
        { title: 'Seus direitos (LGPD)', body: ['Você pode pedir acesso, correção ou exclusão dos seus dados, e esclarecimentos sobre o tratamento, pela Central do aplicativo. Alguns registros (por exemplo, ocorrências e auditoria) podem ser mantidos pelo prazo necessário para segurança e obrigações legais.'] },
        { title: 'Armazenamento e segurança', body: ['Os dados ficam em banco de dados com controle de acesso por perfil. O prazo de retenção e o encarregado de dados (DPO) serão definidos pela operação e informados aqui antes da liberação comercial.'] },
      ]} />
  );
}
