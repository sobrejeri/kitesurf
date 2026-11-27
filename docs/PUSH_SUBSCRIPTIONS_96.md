# #96 — assinaturas push por titular (opt-in desligado)

## Estado desta entrega

A base é `d01c3f6` (receptor passivo da #363 já incluído pela #366). Esta etapa prepara registro e revogação de assinaturas; não existe remetente/outbox/envio de push. Nenhum endpoint real foi criado e nenhuma permissão real de navegador foi solicitada.

A interface aparece em Notificações do Aluno/Instrutor/Admin e no perfil do Afiliado somente quando `NEXT_PUBLIC_VENTO_PUSH_SUBSCRIPTIONS_ENABLED=true`. O exemplo permanece `false`. Ativar exige clique explícito; renderizar não pede permissão. A renovação cancela a assinatura anterior do navegador antes de criar outra, para não vincular silenciosamente o endpoint de uma conta anterior. Falha ao persistir cancela a nova assinatura.

## Banco e titularidade

Migration gerada pelo comando oficial `supabase migration new push_subscriptions_opt_in` usando CLI 2.122.1: `20261127005947_push_subscriptions_opt_in.sql`. Não aplicada remotamente.

- `push_subscription_settings.enabled=false` é uma segunda trava, no banco. Não há permissão cliente para ler/alterar essa configuração.
- `push_subscriptions` tem endpoint único global, owner e session_id inferidos da sessão, chaves de criptografia, expiração e revogação. O cliente não envia owner/session_id.
- O registro exige papel válido, MFA do Admin pela regra central, session_id de JWT válido e uma linha correspondente a esse usuário em `auth.sessions`. Token sem sessão existente não reativa a assinatura.
- RPC de registro faz upsert somente quando o endpoint já pertence ao próprio usuário. Outro dono, inclusive com registro revogado ainda existente, recebe recusa genérica; ownership não é alterado pelo upsert.
- RLS permite ler somente metadados próprios. Não há INSERT/UPDATE/DELETE direto para `authenticated`, SELECT das chaves pelo cliente, EXECUTE para anon/PUBLIC nem chave de serviço no app.
- Desativar revoga somente o endpoint do dono e apaga as chaves. Repetir é seguro e continua disponível quando registro está desligado.
- Logout com a flag ativa tenta revogar todos os endpoints da sessão atual antes de sair, sem encerrar outros dispositivos. Falha de revogação não impede logout. Como defesa adicional, a FK para `auth.sessions(id) ON DELETE CASCADE` remove os endpoints quando o Supabase elimina a sessão, inclusive se a RPC de revogação falhar. Não alteramos o comportamento do provedor Auth.
- O futuro remetente deve conferir sessão/expiração/configuração vigentes e não selecionar linhas revogadas. Limites de inatividade/vida de sessão do provedor continuam dependentes de sua própria política e limpeza.

## Validação de payload

HTTPS obrigatório, endpoint com até 2048 caracteres ASCII, sem credenciais, porta explícita, fragmento ou destino arbitrário. Hosts suportados: `fcm.googleapis.com`, `push.services.mozilla.com` e seus subdomínios imediatos, `web.push.apple.com`, subdomínio imediato de `notify.windows.com`. A lista é restrita para não transformar o futuro remetente privilegiado em cliente de URLs arbitrárias; um provedor novo exige revisão. O futuro remetente também deve controlar egress/resolução de rede.

`p256dh` deve ter base64url canônico de 87 caracteres, 65 bytes e prefixo de ponto público não comprimido 0x04; `auth`, base64url canônico de 22 caracteres e 16 bytes. Não confundir validação de formato de chave de assinatura de navegador com validação criptográfica do remetente. Expiração, quando enviada, deve ser finita e futura. Campos extras, incluindo dono forjado, são recusados nas ações.

## Pré-requisitos exatos para uma futura ativação

1. Conciliar o baseline real, verificar estrutura `auth.sessions(id,user_id)`, aplicar e conferir somente a migration nova, RLS, grants, FKs e RPCs com contagens. Não reaplicar o histórico antigo.
2. Configurar `NEXT_PUBLIC_VENTO_PUSH_VAPID_PUBLIC_KEY`: chave pública VAPID P-256, ponto não comprimido de 65 bytes, base64url sem padding (87 caracteres). O exemplo fica vazio e a interface recusa ativação sem formato válido.
3. Manter a chave privada VAPID correspondente exclusivamente no futuro remetente. Ela não é usada nem configurada neste app nesta etapa; não existe variável privada de envio implementada aqui. Definir também a identidade de contato VAPID (mailto ou HTTPS) quando houver remetente. A chave pública VAPID é diferente da chave p256dh individual da subscription.
4. Homologar opt-in, recusa, renovação/troca de conta, revogação/logout, iPhone instalado, Android e desktop com usuários fictícios. Não habilitar o registro no ambiente atual só porque os testes em VM/SQL passaram.
5. Implementar e testar remetente/outbox com destinatário por owner, idempotência, retry limitado, descarte 404/410 e executor identificado. Somente então configurar os dois gates de registro (`NEXT_PUBLIC_VENTO_PUSH_SUBSCRIPTIONS_ENABLED` e configuração no banco) no ambiente aprovado.

Nenhuma chave foi gerada/lida, nenhum serviço foi provisionado e nenhum custo foi contratado.

## Testes e limites

`scripts/test-push-subscriptions.mjs` executa schema, ações e componente reais com APIs simuladas: OFF sem efeitos, entrada estrita sem owner, autenticação/RPC, consentimento explícito, renovação sem reutilizar conta anterior, chamada duplicada, desfazer assinatura após recusa, revogação e ordem de logout.

`supabase/tests/96_push_subscriptions.test.sql` em PostgreSQL descartável cobre os quatro papéis, Admin sem MFA, anon, grants/RLS, chaves canônicas, hosts/tamanhos, sessão de outro usuário, conflito entre donos, DML direto, idempotência, revogação com gate OFF, remoção de chaves, escopo por sessão e cascade por exclusão de sessão. O stub local ganhou somente a estrutura mínima de `auth.sessions`.

Esses testes não são login real nem prova de entrega em aparelho. O CI completo continua obrigatório antes de integrar; a homologação #96 permanece pendente até a entrega externa ser provada.

