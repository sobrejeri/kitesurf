# #96 — recepção push e prontidão de entrega

## Implementado nesta etapa

O service worker recebe o evento `push` e exibe somente “VentoKite” e “Você tem um novo aviso. Abra o app para conferir.”. Nomes, conteúdo de chat, detalhes de reserva e imagens recebidos no payload não são exibidos na tela bloqueada. Não pede permissão nem cria assinatura automaticamente.

Contrato mínimo do futuro remetente: `{ notificationId: UUID, href: caminhoInterno }`. `notificationId` é opcional; UUID válido vira uma tag estável para substituir uma notificação repetida no sistema operacional. IDs diferentes têm tags diferentes. Isso não é idempotência do futuro dispatcher.

Destinos aceitos: mesma origem, caminho `/` ou áreas `/aluno`, `/instrutor`, `/admin`, `/afiliado`, `/pousada`. Payload ausente/malformado ou destino externo/de API cai na página inicial. O clique valida novamente e foca uma janela no destino exato, ou abre outra janela. Não navega uma tela diferente que possa conter formulário não salvo, não marca aviso como lido e não consulta o banco.

## Auditoria do estado encontrado

Na base `c94f2192`, avisos internos usam `app_notifications`, a ação `mark_my_notification_read` e `NotificationInbox`. O service worker tinha somente `activate` e `fetch`. Não foram encontrados implementação de `PushManager.subscribe`, persistência de subscriptions, par VAPID, remetente Web Push ou dispatcher/retry na árvore do repositório. O `.env.example` contém apenas as três configurações públicas Supabase/site.

Não foram lidos segredos do Render. A ausência de implementação/configuração no repositório não prova ausência de credenciais externas. Os e-mails de autenticação do Supabase não representam envio operacional de oferta/chat/cancelamento. Não há implementação operacional de e-mail/WhatsApp nesta etapa.

## Dependências ainda necessárias para entrega real

1. **Consentimento no cliente:** ação explícita do usuário para permissão e assinatura, detecção de suporte/instalação por dispositivo, estado negado e revogação no logout/troca de conta. Não vincular assinatura antiga a outra conta silenciosamente.
2. **Persistência por titular:** registrar/remover subscription via sessão autenticada, validação de endpoint e chaves, RLS/grants e deduplicação por endpoint. Testar acesso cruzado entre os quatro perfis. Ainda não há migration/API nesta etapa.
3. **Credenciais do remetente:** gerar/configurar par VAPID, manter a chave privada somente no servidor e publicar apenas a chave pública no consentimento do cliente. Definir identidade de contato do remetente. Nenhum par foi criado ou lido aqui, e nenhum nome de variável novo foi ativado.
4. **Remetente/outbox:** selecionar destinatários por titularidade, enviar payload mínimo, idempotência por aviso/subscription, retry limitado de falhas temporárias e remoção da subscription expirada (respostas 404/410), sem marcar entrega por simples tentativa. Proteger o disparo interno e não permitir URLs arbitrárias fornecidas por cliente.
5. **Executor offline:** identificar e homologar agendador no ambiente autorizado. O poller de tela não substitui o job. Não habilitar as flags existentes só porque este receptor foi integrado.
6. **Aparelhos e navegadores:** testar entrega com app fechado, clique, conta deslogada/trocada, duplicação, conexão indisponível e retomada em iPhone/PWA, Android e desktop com contas fictícias autorizadas. VM não prova entrega nem suporte do aparelho.
7. **Canais adicionais:** selecionar provedor e política de opt-in se e-mail operacional/WhatsApp fizerem parte da entrega. Orçar antes de criar serviços pagos. Nenhum serviço, plano ou custo foi contratado nesta etapa.

## Validação

`node scripts/test-pwa-push.mjs` executa handlers reais do worker em VM com APIs simuladas: privacidade do conteúdo, payload inválido, destinos inseguros, tags, foco/abertura, falha de foco, erro de exibição e duração do evento. `node scripts/test-pwa-offline.mjs` preserva o comportamento de navegação offline. O CI também precisa passar typecheck, lint, build e SQL.

Referências: [push](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/push_event), [notificationclick](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/notificationclick_event), [showNotification](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification).

Recepção preparada não equivale a assinatura, envio ou entrega homologada. Nenhum DDL remoto, pagamento ou dado de cliente é alterado.
