# Worker de fila — integração desativada por padrão

Endpoint interno: `POST /api/internal/queue-maintenance`. **Não há agendamento automático configurado nesta PR.** O código responde 503 enquanto `QUEUE_WORKER_ENABLED` não for literalmente `true`.

## Pré-requisitos para ativação futura

- Homologar primeiro com 3 instrutores de teste e solicitações isoladas; verificar expiração A→B→C sem navegador aberto e aceite concorrente.
- Provisionar no Render, apenas no backend, `QUEUE_WORKER_TOKEN` aleatório com pelo menos 32 caracteres e `SUPABASE_SECRET_KEY` (chave secreta de backend do projeto correto). **Nunca** usar prefixo `NEXT_PUBLIC_` para segredos, nem registrar seus valores.
- Confirmar permissões do segredo para leitura das solicitações e execução da RPC privilegiada. Não conceder EXECUTE a anon/authenticated.
- Depois de revisar estados antigos, configurar um agendador externo para POST com `Authorization: Bearer <token>`, observando 200/503, logs e alarmes. Evitar duas execuções simultâneas; a RPC protege linhas com FOR UPDATE.
- Ativar `QUEUE_WORKER_ENABLED=true` apenas após a homologação. Sem essas configurações, o endpoint permanece inerte.

## Comportamento

Em cada chamada autorizada, examina até 20 solicitações `searching` expiradas e 20 ativas mais antigas. A RPC `advance_instructor_offer(uuid)` valida o status, expira ofertas e avança a fila sob bloqueio de linha. O lote é limitado, mas não é uma solução completa para filas maiores; monitorar backlog. Erros individuais resultam em 503 para permitir alerta/repetição. Não retorna identificadores de reservas.

**Limitação:** não existe teste E2E de job externo nesta PR; a ativação em produção permanece bloqueada. O checkout real continua desligado.
