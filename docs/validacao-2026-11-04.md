# Vento — validação de 4 de novembro de 2026

Escopo: aluno, instrutor, administrador e pousada. Checkout permanece desativado por decisão do proprietário. Este relatório registra evidências e pendências; não constitui aprovação integral da plataforma.

## Confirmado no site

- Sessões autenticadas nos quatro perfis de teste.
- Navegação inicial: 18 páginas administrativas, 9 do instrutor e 4 da pousada, sem tela de erro nas páginas visitadas. Isso não equivale a testar todas as operações de escrita.
- Cabeçalho desktop corrigido, avatar circular com iniciais quando não há foto e banner com fotografia real do Preá em resolução maior.
- Calendário do aluno desabilita dias anteriores à data local.
- Causa do pedido invisível ao instrutor identificada na política RLS. Proprietário executou a correção 33. Uma nova solicitação ficou visível e foi aceita pelo instrutor, gerando VNT-1005.
- Aula concluída TEST-1001 abriu a própria reserva na evolução, com encontro, horas e avaliação. As reservas preexistentes foram preservadas.
- Nenhuma cobrança, transação Pix/cartão ou confirmação de pagamento foi realizada durante estes testes.

## Alterações da segunda etapa

- Migração 34: confirmação de validação separada de pagamento, marcação de teste, exclusão das comissões da pousada, notificações sem falsa indicação de cobrança e armazenamento privado de rascunhos administrativos de políticas.
- Migração 35: bloqueio de horários sobrepostos também no banco, com trava por aluno, incluindo buscas ativas; libera reservas cuja janela de confirmação já expirou.
- Agenda administrativa usa encontros reais e filtros de dia/semana/mês no fuso do Ceará; avisos e atendimento consultam os registros reais.
- Conta e acesso, recuperação de senha por perfil e listagem administrativa da equipe substituem caminhos de demonstração. A listagem de equipe não concede novos privilégios.
- Aulas em andamento permanecem na lista ativa; próximas aulas são ordenadas por data crescente.
- Chat exibe as mensagens mais recentes, permite consultar o histórico e atualiza a conversa aberta automaticamente.
- Textos de reagendamento acompanham as regras existentes de 72 horas e das janelas de resposta de 12 horas, sem alterar a política comercial vigente.

## Verificação automatizada

- TypeScript, ESLint e build de produção passaram.
- Scripts JavaScript do projeto e verificação das relações PostgREST passaram.
- Todas as 35 migrações e 30 arquivos de testes SQL passaram em PostgreSQL isolado via PGlite, incluindo RLS, dono/papel, confirmação idempotente, ausência de pagamento, exclusão de comissão, concorrência de agenda e expiração de reservas.
- O script nativo `scripts/test-db.sh` foi tentado, mas o `initdb` não executa como root neste ambiente. PGlite foi usado como alternativa; não representa execução no Supabase de produção.

## Pendências para aprovação

1. Aplicar `supabase/install/VENTO_VALIDACAO_34_35.sql` no Supabase de produção. A migração 33 já foi executada pelo proprietário. Não executar novamente a 34 após instalação bem-sucedida.
2. Após a aplicação, testar no site uma nova busca, aceite e confirmação sem cobrança, incluindo bloqueio de duplicidade e ausência de comissões.
3. Completar testes reais de envio/recebimento do chat, foto de perfil, documentos, aprovação/reprovação, indicação da pousada e registro/conclusão de encontros com contas de teste, preservando dados existentes.
4. Recuperação de senha depende de URL de redirecionamento e serviço de e-mail no Supabase, caixa de e-mail controlada pelo proprietário e redefinição manual da senha. O recebimento do e-mail ainda não foi validado.
5. Notificações externas, falhas de rede, dispositivos móveis e regras comerciais excepcionais precisam de validação específica. Checkout, estornos e repasses permanecem fora desta etapa.

Não foram enviados documentos de identidade fictícios nem aprovados cadastros com documentação inventada.
