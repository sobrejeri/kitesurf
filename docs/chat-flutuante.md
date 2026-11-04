# Chat flutuante — aluno e instrutor

O chat usa as mensagens privadas e notificações existentes. O texto básico usa mensagens, notificações e fotos existentes (08, 16, 25 e 26). Presença, leitura, arquivos e localização exigem aplicar a migration 37, depois das anteriores. Antes disso, o texto permanece disponível e os novos controles ficam desativados.

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

## Recursos da migration 37

- Fotos privadas também na lista de conversas. Identificação: “Reserva VNT-… · dia DD/MM”, usando encontro em andamento, próximo agendado ou último encontro não cancelado.
- Online significa atividade da aba nos últimos 90 segundos; não garante disponibilidade para responder. “Mostrar quando estou online” oculta também o último acesso dos outros participantes.
- “Visualizada” exige cursor de leitura persistido pelo outro participante, com janela visível, focada e conversa no fim. Envio não significa visualização.
- Fotos e arquivos até 10 MB: JPEG, PNG, WEBP, GIF, HEIC/HEIF, PDF, TXT, CSV, DOCX e XLSX. Arquivos privados, caminhos gerados no servidor, acesso apenas aos participantes. Verificação de assinatura não substitui antivírus. HEIC/HEIF ficam disponíveis para download, sem miniatura no navegador.
- Localização atual somente após clicar no pino, conceder permissão ao navegador e confirmar envio. Sem rastreamento contínuo. O destinatário abre o mapa pelo link.
- Anexos e localização também aparecem no histórico completo.

Verificação desta atualização: 37 migrations e 32 arquivos de testes SQL passam no PostgreSQL embarcado (PGlite); os testes JS cobrem leitura, presença, data e formatos. O script PostgreSQL nativo não inicia neste ambiente sem PostgreSQL instalado; a CI executa a suíte nativa. Envio de texto e recebimento com bolha e foto foram observados no site. A automação do navegador ficou indisponível antes do teste de resposta. Os novos anexos, GPS e leitura ainda precisam de teste real após aplicar a migration 37; não estão aprovados como validação ponta a ponta.
