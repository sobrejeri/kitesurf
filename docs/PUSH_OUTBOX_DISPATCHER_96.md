# #96 — outbox e dispatcher Web Push externo (OFF)

Implementação preparada em branch própria sobre as subscriptions #370. Nenhuma migration foi aplicada remotamente, nenhuma chave existente foi lida, nenhum push foi enviado, nenhum agendador/serviço foi criado. O teste criptográfico usa chaves efêmeras em memória e substitui o HTTP por uma função simulada.

## Fluxo e autorização

Um trigger de `app_notifications` cria no máximo um job por aviso/subscription. Só enfileira quando os dois gates do banco estão ON, depois do corte de ativação, com assinatura do destinatário, sessão Auth existente/ativa, consentimento anterior ao aviso e assinatura não revogada/expirada. Não faz backfill. Uma renovação de consentimento invalida jobs de avisos anteriores a `subscription.updated_at`.

`claim_push_dispatch` emite lease de dois minutos com token aleatório. O bloqueio da configuração serializa os budgets de todos os workers: 100 claims globais e cinco por destinatário por minuto. A linha do job também é travada; outro worker não recebe o mesmo lease. `prepare_push_dispatch` confere novamente gate, titularidade, sessão, expiração, leitura do aviso e versão da assinatura, e grava a intenção antes de devolver material criptográfico ao worker. Um token só prepara uma tentativa.

As quatro RPCs públicas do dispatcher são exclusivas de `service_role` e do papel sem LOGIN `vento_push_dispatcher`; anon/authenticated/PUBLIC não podem chamá-las. O papel dedicado não lê tabelas diretamente; RLS permanece ligada. O helper de targets não é concedido nem ao worker. O script usa a credencial privilegiada somente fora do app, em `scripts/push-dispatcher`; nada em `src/` importa o worker, e nenhum segredo ganha prefixo público.

## Configuração exata, sem ativação nesta entrega

Instalar o pacote isolado com `npm ci --prefix scripts/push-dispatcher --ignore-scripts`. `web-push` está fixado em 4.0.0 com package-lock; Node >=22. A aplicação Next não recebe essa dependência.

| Variável do worker | Regra |
|---|---|
| PUSH_DISPATCH_ENABLED | Só `true` permite consultar o banco; ausente/OFF não lê credenciais nem faz rede |
| PUSH_DISPATCH_DRY_RUN | Padrão true; somente valor literal `false` permite claim/prepare/envio |
| PUSH_DISPATCH_PROJECT_REF | Referência explícita de 20 letras; sem padrão |
| PUSH_SUPABASE_URL | Exatamente `https://<PUSH_DISPATCH_PROJECT_REF>.supabase.co`, sem barra final |
| PUSH_SUPABASE_SERVICE_KEY | Credencial de worker/role autorizada; somente ambiente privado externo |
| PUSH_DISPATCH_ACTIVATED_AT | Instante do corte; deve coincidir exatamente com `push_dispatch_settings.activated_at`, não pode ser futuro |
| PUSH_DISPATCH_LIMIT | 1–100 por invocação; padrão 25, além dos budgets compartilhados do banco |
| PUSH_VAPID_SUBJECT | Contato `mailto:responsavel@dominio` |
| PUSH_VAPID_PUBLIC_KEY | Chave pública VAPID do mesmo par usado por NEXT_PUBLIC_VENTO_PUSH_VAPID_PUBLIC_KEY |
| PUSH_VAPID_PRIVATE_KEY | Chave privada correspondente, somente ambiente privado externo; nunca no app/log/relatório |

Também precisam ser habilitados conscientemente os gates DB `push_subscription_settings.enabled` e `push_dispatch_settings.enabled`, após conciliação e homologação. Ambos são OFF por padrão. Esta entrega não executa essa ativação, não gera par VAPID e não configura Render.

Executável: `node scripts/push-dispatcher/run.mjs`. Sem opt-in devolve apenas contadores zerados. Com ENABLED=true e dry-run padrão chama somente preview agregado; não faz claim, não expõe subscription/key e não carrega VAPID. Aplicação exige todos os opt-ins/configurações anteriores. O VAPID é validado antes do primeiro claim. Não existe endpoint público HTTP do worker nem execução automática instalada.

## Resultados, retries e ambiguidade

| Resultado | Comportamento |
|---|---|
| HTTP 201 | `accepted`: aceito pelo serviço push; não significa entrega ao aparelho ou leitura |
| HTTP 404/410 | Job terminal; revoga assinatura e apaga keys só se a versão ainda for a usada na tentativa |
| HTTP 408/429/500/502/503/504 | Até cinco tentativas; backoff 30, 60, 120, 240 segundos, respeitando Retry-After limitado a 3600 s e a validade do job |
| Outros 3xx/4xx | Terminal; não segue redirects |
| Timeout/socket perdido/sucesso não reconhecido | `unknown`, sem repetição automática |
| Crash após prepare sem settlement | Lease vencido vira unknown; não reenvia cegamente |
| Lease vencido antes de prepare | Pode receber novo token; ainda não houve tentativa HTTP |

Jobs de oferta vencem em dois minutos; demais categorias em 15 minutos. A fila não marca aviso interno como lido nem afirma entrega ao dispositivo. Uma falha de settlement encerra o processo e não tenta enviar novamente. Unknown exige reconciliação humana antes de qualquer eventual reprocessamento: não limpar estado/lease para “tentar de novo” sem investigar.

O payload contém exclusivamente notificationId e destino genérico da área: aluno/instrutor/admin → avisos; afiliado → início. Não envia nome, corpo do chat, reserva, imagem, owner/session ou href de entidade. Topic estável por aviso e a tag do receptor ajudam a substituir repetição visual; isso não é garantia de entrega exatamente uma vez.

## Egress e limites

Revalida endpoint HTTPS canônico, sem porta/credencial/fragmento e somente FCM, Mozilla, Apple e Windows conforme a allowlist da subscription. DNS do agente HTTPS rejeita endereços privados/reservados e respostas mistas; não usa proxy nem segue redirects. Transporte usa aes128gcm, timeout de socket de 10 s e destruição do agente em 20 s. RPCs têm timeout de 15 s e redirect:error. Logs são apenas contadores/códigos sanitizados; erros/bodies/endpoints/chaves do provedor não são impressos.

Revalidação ocorre imediatamente antes da tentativa. Não é possível recolher um push já aceito pelo serviço; revogação/renovação/sessão que muda após a revalidação pode coincidir com um envio em voo. O conteúdo permanece genérico. Essa corrida, entrega com app fechado, consentimento real, logout e aparelhos iPhone/PWA/Android/desktop ainda exigem homologação autorizada.

## Testes e referências

- `scripts/test-push-dispatcher.mjs`: OFF sem efeitos/segredos, preview, privacidade, destinos/DNS, claims concorrentes simulados, retry/gone/unknown e criptografia real do pacote com HTTP simulado.
- `supabase/tests/96_push_outbox.test.sql`: PostgreSQL descartável, grants/RLS, gates, ownership, dedup, tokens/fencing/replay, renovação/revogação, backoff/cap e budgets.
- `scripts/test-push-outbox-concurrency.sh`: duas conexões reais no cluster descartável: um lease e uma preparação. Não envia push.

Fontes primárias consultadas: [RFC8030](https://www.rfc-editor.org/rfc/rfc8030), [RFC8291](https://www.rfc-editor.org/rfc/rfc8291), [web-push oficial](https://github.com/web-push-libs/web-push), [funções Supabase](https://supabase.com/docs/guides/database/functions). O código instalado de web-push4.0.0 foi inspecionado: faz uma chamada https.request, sem follow de redirects. Changelog Supabase consultado; CLI2.122.1 foi fixada para gerar o arquivo, sem migrar configuração v3.

Implementado/testado isoladamente não significa sender operacional. Faltam conciliação/aplicação autorizada da migration, credenciais privadas, configuração dos gates/corte, agendador e prova real de entrega. Não há homologação integral da #96 nesta etapa.
