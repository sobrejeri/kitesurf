# Chat flutuante — aluno e instrutor

O chat usa as mensagens privadas e notificações existentes. Não exige nova migração; depende das migrações já existentes de mensagens, notificações e fotos (08, 16, 25 e 26).

- O botão acompanha todas as páginas autenticadas da área do aluno ou do instrutor, por meio do layout compartilhado. Visitantes e administradores não recebem acesso às conversas privadas.
- Mensagens não lidas fazem aparecer até três bolinhas de participantes com contador e ícone de mensagem. Reservas do mesmo participante compartilham a bolinha, mas cada conversa continua identificada pelo código da reserva.
- A foto vem dos arquivos privados já autorizados ao participante. Quando não existe ou falha, aparecem as iniciais.
- A conversa abre em painel sobre a página. Pode ser minimizada; o rascunho permanece ao navegar dentro da mesma área. As mensagens são persistidas no banco, sem histórico de mensagens em localStorage.
- Links existentes para uma conversa abrem o painel. Ctrl/Cmd+clique e “Abrir histórico completo” preservam a opção de página inteira.
- A atualização é automática a cada três segundos enquanto a aba está visível. Não é uma notificação do sistema operacional com o navegador fechado nem uma bolha sobre outros aplicativos.
- Notificações são marcadas como lidas somente para a própria conta e conversa, até a última mensagem carregada, com janela visível/focada e leitura no fim da conversa.
- O painel mostra as últimas cem mensagens, permite carregar anteriores e mantém o ponto de leitura. A lista mostra cinquenta reservas recentes e acrescenta reservas antigas com mensagens não lidas. O contador visual mostra “99+” acima desse limite.
- Acesso e envio conferem sessão, papel, propriedade e status de confirmação/conclusão. RLS e as funções existentes repetem as verificações. Não há chave administrativa no app.

Validação: testes de agrupamento por participante, roteamento por área, ordenação e deduplicação; TypeScript, ESLint, build e suíte existente do projeto. O envio continua sujeito à proteção já existente de dois segundos entre mensagens.

Sugestão para a inicial (ainda não aplicada): para quem possui reservas, substituir os três cards de apresentação por próxima aula, horas por reserva e evolução avaliada pelo instrutor. Para novos usuários, manter a apresentação. A busca de novas aulas permanece disponível nos dois casos.
