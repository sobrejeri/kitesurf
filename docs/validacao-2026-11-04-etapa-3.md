# Vento — terceira etapa de validação

Data: 04/11/2026 no Ceará (05/11 UTC). Checkout continua desativado. Este documento separa testes automatizados, observação no site e pendências; não representa aprovação integral nem garantia de ausência de bugs.

## Atualizações implementadas

| Área | Alteração | Critério |
|---|---|---|
| Inicial do aluno | Painel para quem já tem reservas: aula atual/próxima, horas, nível avaliado, agenda e nova busca | Dados reais da conta; sem métricas ou avaliações inventadas |
| Identidade visual | Azul profundo e petróleo, ações em ciano, destaque laranja da marca; cabeçalho e busca no mesmo tema | Layout adaptável, contraste e foco de teclado |
| Evolução | Horas do painel pertencem a uma reserva; só minutos efetivamente registrados contam | Não somar saldos de instrutores/reservas diferentes; data passada não conclui aula |
| Chat | Histórico completo registra leitura, mostra presença e recibos; navegação para mensagens recentes não abre outro painel | Janela focada/visível e final da conversa visível; respeito às permissões existentes |
| Chat | Aviso de falha de sincronização desaparece quando a conexão volta | Erros de envio permanecem independentes |
| Chat com imagem | Miniatura tem espaço reservado antes de carregar; leitura confere a rolagem real | Evitar deslocamento da mensagem e recibo antecipado |
| Histórico | Link da inicial abre diretamente Aulas anteriores; encontro passado sem conclusão aparece Aguardando registro | Data passada não equivale a realização |
| Pousada | Explicação da comissão restrita à primeira reserva elegível | Validação não gera comissão; link só liberado após aprovação |
| Financeiro | Textos distinguem valores de referência, comissão total e repasse | Sem receita fictícia das aulas de teste; resumo do administrador explicita limite de 500 reservas |
| Instrutor | Fila informa confirmação de aula durante a validação | Não apresentar confirmação de pagamento onde não houve cobrança |

## Observado nas contas de teste no site

- Acesso às áreas de aluno, instrutor, administrador e pousada.
- Versão do chat `2f824032b2d9` carregada pelo botão de atualização do próprio aplicativo.
- Lista de conversas com foto do participante e identificação “Reserva … · dia DD/MM”.
- Texto enviado pelo aluno apareceu no instrutor; duas mensagens não lidas geraram bolha com contador.
- Abrir a conversa removeu o contador; indicadores Online e Visualizada apareceram na conversa.
- TXT fictício foi enviado pelo aluno, recebido e baixado na conta do instrutor. O conteúdo baixado foi conferido e corresponde ao arquivo enviado. Não foi enviado dado pessoal nem documento de identidade.
- PNG de teste (ícone do Vento) enviado pelo instrutor e recebido com miniatura na conta do aluno. O teste revelou deslocamento de rolagem no carregamento da imagem, corrigido reservando espaço para a miniatura.
- Na reserva explicitamente marcada AULA TESTE VNT-TEST-1002, o instrutor registrou 90 minutos, duas etapas concluídas e uma praticada. A evolução do aluno mostrou 1h30 realizadas, 75% das horas, saldo de 30 minutos e as três etapas correspondentes. Encontro saiu de Em andamento e entrou em Concluídas.
- A inicial publicada mostrou próxima aula TEST-1004 em 11/11 às 11h, horas separadas dessa reserva e nível já avaliado. Cabeçalho, cards e busca estão no tema azul profundo.
- Administração: formulário de rascunhos comerciais disponível, sem alerta de ausência da migração 34. Nenhuma política comercial foi alterada para o teste.
- Administração: edição de preço por nível bloqueada com aviso explícito de ausência da migração 36. Preço vigente continua R$ 300/h para todos os níveis.
- Pousada teste continua Em análise; a divulgação informa corretamente que o link depende de aprovação. Não foi aprovada documentação fictícia.

## Testes automatizados

- TypeScript, ESLint e build de produção passaram.
- 15 scripts JavaScript passaram, incluindo seleção do encontro na inicial, saldo separado por reserva, histórico, agenda, preços, chat e relações PostgREST.
- Todas as 37 migrações e 33 arquivos de testes SQL passaram em PostgreSQL embarcado isolado (PGlite).
- O novo teste integrado cria uma solicitação com dois encontros, aceita como instrutor, confirma sem cobrança duas vezes para verificar idempotência, envia mensagem, verifica leitura, impede início fora de ordem, registra 45 e 60 minutos, conclui a reserva, avalia habilidades, recebe avaliação e solicita nova aula ao mesmo instrutor. Confere que não foram criados pagamentos nem comissão de indicação. Executa com ROLLBACK e não modifica a produção.
- O PostgreSQL nativo não está instalado no executor local; `scripts/test-db.sh` não conclui nele. A CI executou todas as etapas com sucesso, incluindo PostgreSQL nativo: https://github.com/sobrejeri/kitesurf/actions/runs/41943331973 e https://github.com/sobrejeri/kitesurf/actions/runs/41943549936.

## Pendências para aprovação

1. **Aplicar a migração 36 no Supabase de produção**: `supabase/migrations/20261104000036_level_hourly_prices.sql`. Depois, validar edição e simulação de preços por nível. Não escolher valores comerciais sem decisão do proprietário. A migração 37 já respondeu no site; não repetir sua instalação só por causa do erro antigo de cópia incompleta.
2. Repetir o fluxo completo de nova reserva/aceite/confirmação/conclusão também na interface publicada. A jornada SQL passou; isso não substitui todos os cliques reais.
3. Verificar outros formatos e aparelhos reais. Envio, recebimento e download do TXT, além de envio/miniatura do PNG, passaram nesta rodada; isso não aprova automaticamente todos os formatos.
4. Validar GPS no aparelho com autorização de localização, prévia e confirmação; não foi enviada localização privada durante esta etapa.
5. Validar upload/atualização de foto e documentos, aprovação/reprovação com documentos legítimos, cadastro de pousada e sua indicação completa. Permissões e regras têm testes SQL; o ciclo operacional real ainda está pendente.
6. Recuperação de senha e e-mail de confirmação dependem de caixa postal controlada pelo proprietário e entrega real; não foi alterada senha durante os testes.
7. Testar Android/iPhone, teclado, conexões lentas e perda/retorno de rede. Responsividade no código não equivale a aprovação em aparelhos físicos.
8. Antes de produção comercial: consolidar relatórios financeiros sem limite de histórico, políticas definitivas, monitoramento e recuperação de falhas. Checkout, Pix/cartão, estornos e repasses ficam para etapa posterior, conforme combinado.
9. **Reutilização do saldo após encontro parcial:** o teste de 90/120 minutos preservou e exibiu 30 minutos, mas ainda falta o fluxo para agendar esse saldo na mesma reserva/instrutor, sem nova cobrança. O sistema atualmente conclui a reserva quando não há encontros ativos. Esta pendência impede aprovação integral do ciclo de horas.

## Publicação

Inicial e correções principais publicadas em `5129fbdd8235dfe875c076279a1d95639e7d1b57`, conferidas na área do aluno. Correção da miniatura e proteção adicional da leitura em `ccfe5ecb07d8725018db1642be2dc43e425eb211`, com CI aprovada. Ajuste final do atalho de histórico segue na mesma branch de produção.
