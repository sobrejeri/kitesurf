# VentoKite — comando mestre de continuidade entre conversas

Este documento é a memória operacional do projeto em GitHub. **Não permite iniciar novas conversas sozinho ou executar trabalho fora de uma sessão ativa.** Serve para que, ao abrir uma nova conversa e enviar o comando abaixo, o desenvolvimento seja retomado sem reconstruir todo o histórico.

## Comando para copiar em outro chat

> **CONTINUAR VENTOKITE — EXECUÇÃO ATÉ PRONTO PARA CHECKOUT**
>
> Continue a execução técnica do VentoKite no repositório GitHub `sobrejeri/kitesurf`, branch `claude/cool-ride-x47z5c`, App Render `vento-kitesurf.onrender.com` e Supabase do projeto **kitesurf** (`qadkqjfmmnxvovyyhqxw`), **não** do Turiva.
>
> Leia primeiro o plano `docs/PLANO_ENTREGA_VENTOKITE_SEM_CHECKOUT.md` e o quadro mestre GitHub **issue #105**, além das issues específicas e os últimos commits/PRs, CI, migrations reais do Supabase e deploy atual do Render. Respeite decisões de design aprovadas e as 18 frentes do quadro.
>
> **Objetivo:** entregar a plataforma inteira, com áreas Aluno, Instrutor, Admin e Pousada e Laboratório 3D, testada, refinada e homologada no que for possível, **faltando somente a integração do checkout real**. Prefira concluir uma tarefa P0 de cada vez antes das P1/P2; não pare só na análise se houver correção segura que possa executar agora.
>
> Você já tem autorização de desenvolvimento para refinar telas, fontes, botões, cores, menus, layouts responsivos, fluxos, testes, migrations necessárias não destrutivas, PRs e deploys de código. **Preserve todas as reservas, dados e operações financeiras**; não ative checkout real, split, pagamentos, estornos nem repasses. Não crie serviço pago nem faça exclusão/reset irreversível sem verificação e autorização específica. Leve em conta o limite de acesso a navegador/contas reais.
>
> Execute os testes de regressão, confira `live` no Render e valide RLS/Storage/grants antes de marcar uma frente como homologada. Mantenha migrations 39/40/41/42 e o estado de backend do Protege consistentes: migration 41 bloqueia RPCs de escrita e flag 3B deve continuar OFF até concluir e aprovar homologação real. **Não reaplique em lote as migrations antigas 01–38** antes de conciliar seu baseline.
>
> Ao terminar cada entrega, atualize o plano, a issue específica e a issue **#105**, indicando `feito`, `testado`, `deploy live`, `pendente` e links/IDs. Se uma parte não foi testada no navegador real, não a marque como 100%. Continue pela próxima tarefa de maior prioridade dentro desta execução. Se o trabalho tiver que ser retomado depois, mantenha este documento e o quadro atualizados e forneça o mesmo comando.
>
> **Identidade visual:** mobile aprovado como referência, azul/preto/branco/cinza, logo selecionada e ondas corretas, PC branco com detalhes azuis, tipografia orgânica e hierarquia equilibrada; imagens HD com proporções consistentes, sem botões gigantes e sem aparência genérica de protótipo. Em mudanças amplas, verificar antes/depois com captura visual quando possível.
>
> Entregue relatórios objetivos do que realmente concluiu e do que permanece bloqueado; não simule aprovação nem prometa continuar trabalhando sozinho após o fim do chat.

## Onde está a verdade atual

1. **Quadro mestre vivo:** https://github.com/sobrejeri/kitesurf/issues/105
2. **Plano de entrega:** `docs/PLANO_ENTREGA_VENTOKITE_SEM_CHECKOUT.md`
3. **Documentação de migrações:** `supabase/MIGRATIONS_CATALOGO.md`
4. **Documentação de segurança Protege:** `docs/vento-protege-homologacao-permissoes.md`
5. **Código e CI:** branch `claude/cool-ride-x47z5c`, `.github/workflows/verify.yml` e `scripts/test-db.sh`
6. **Produção:** Render service `srv-dbifnnks728c73f50arg` e Supabase `qadkqjfmmnxvovyyhqxw`

Não deduza o estado atual apenas deste arquivo. Pode haver commits/deploys posteriores. Sempre verificar em GitHub, Render e Supabase antes de qualquer mudança.

## Políticas de retomada

- Nunca assumir que um teste foi aprovado sem evidência do CI e, para fluxos de usuário, sem teste real por perfil.
- Não criar usuário real, simular conta de terceiros ou usar dados de clientes como massa de testes.
- Se a sessão atual não permitir automação de navegador, reportar limitação e prosseguir com o máximo de teste CI/SQL autorizado, preservando pendência visual/E2E.
- Substituição entre instrutores exige segundo instrutor de teste autorizado; ausência dessa conta não pode ser mascarada.
- Credenciais, chaves e informações particulares nunca devem ser incluídas em issue pública ou documentação de Git.
- A entrega final é **PRONTO PARA RECEBER CHECKOUT**, não liberação comercial com pagamentos reais.

## Histórico inicial

- 09/11/2026: migrations 39, 40 e 41 da proteção + 42 de saldo de minutos foram aplicadas no Supabase; PR #122 (`b04a138`) integrada e `live` no Render. Testes SQL reais com `ROLLBACK` passaram para Protege; upload/download real do Storage e E2E com dois instrutores ainda pendentes.
- 09/11/2026: quadro #105 com 18 frentes, 0 homologadas integralmente. Este documento e o plano foram criados para continuidade operacional, não para declarar os módulos concluídos.


## Revisor Claude Code por PR

O projeto possui um **avaliador independente preparado, não necessariamente conectado**:
`docs/CLAUDE_CODE_QA_AUTOMATICO.md`, `.claude/agents/vento-qa-reviewer.md` e `.github/workflows/claude-qa-review.yml`.

**Antes de integrar cada PR:** verifique se o job Claude QA está habilitado pela variável `VENTO_CLAUDE_QA_ENABLED=true` e pela conexão Anthropic. Se estiver operacional, aguarde o parecer e resolva P0/P1 via PR QA separada antes de merge/deploy. Se estiver desativado/skipped, registre `Claude QA: não executado (aguardando conexão)` na issue #105 e prossiga somente com os testes realmente executados. Nunca declare a revisão independente concluída porque o arquivo de workflow existe. O Claude não deve fazer merge ou deploy e não altera banco nem checkout.

## Handoff verificado — 10/11/2026, lote L0 (PR #136)

- Render `srv-dbifnnks728c73f50arg`: último deploy consultado `dep-dbphgnjfr9ks73cud790` **live**, SHA `db9efb992fb6acc1f81e0d014d3fbf8aa81085f3`. Não declarar PR #136 publicada antes de novo deploy live.
- Supabase **kitesurf** `qadkqjfmmnxvovyyhqxw`: migrations 39, 40, 41 e 42 registradas; Protege 3B permanece fechado; nenhuma SQL aplicada nesta execução.
- PR #132 conflitada: correção funcional reimplementada sobre HEAD atual na PR #136 (`fix/l0-request-navigation-rebased-20261110`). Inclui rota de solicitação, seta Voltar e seleção correta de Minhas aulas mobile/PC, teste de regressão e job CI. PR #135 e #130 de documentação abertas.
- Workflow Claude independente para PR #136 retornou **SKIPPED**; não houve revisão independente. CI de desenvolvimento não confirmado na primeira consulta; **não houve merge nem deploy** da PR #136 nesta execução.
- Próxima execução: consultar CI da PR #136, corrigir eventuais falhas, integrar somente se aprovado, conferir novo SHA live, reconciliar PR #132 e documentações #135/#130; em seguida avançar em RLS/Storage por perfil e E2E autorizado. Sem checkout, sem tocar dados reais, sem migrations 01–38. 0/18 frentes homologadas integralmente.

## Handoff — 10/11/2026 12h (BRT), PR #136

- CI do commit `ee7a6bbe` falhou em `scripts/test-l0-mobile-navigation.mjs`, por regex de teste com barras escapadas indevidamente; typecheck, lint e verificações anteriores passaram. Log: https://github.com/sobrejeri/kitesurf/actions/runs/42832552074.
- Corrigida a asserção de teste na branch `fix/l0-request-navigation-rebased-20261110` pelo commit `e5acb702`; sem mudança de comportamento de produção nesta correção. Aguardar CI do HEAD mais recente desta PR, verificar o job Claude (antes SKIPPED), somente integrar se CI passar, depois confirmar SHA live no Render.
- Último Render verificado `db9efb992fb6acc1f81e0d014d3fbf8aa81085f3` (`live`). Supabase kitesurf confirma migrations 39–42. Nenhum SQL executado, Protege 3B fechado, checkout desativado. 0/18 homologadas integralmente.
- Após #136: reconciliar #132 e PRs de documentação, avançar testes de RLS/Storage por perfil sem tocar dados reais. Não declarar E2E autenticado sem evidência.

## Handoff — 10/11/2026 13h22 BRT (L0)

- PR #136 **integrada** após CI do HEAD `e40425320a4d449d0a9199c690e1772219c8c3f0` **success** (Actions run `42843570136`). Merge squash `3ec384d268c089492b1bbe1ca38188bf532cb172`. Claude QA run `42843570587` **skipped**, portanto NÃO revisou. PR #132 fechada sem merge porque substituída pela #136.
- Render deploy `dep-dbpk9bbm8hqs739vukv0` do SHA `3ec384d` foi observado em `build_in_progress` (consulta 16:22 UTC); **não declarar live até reconferir**. Último live confirmado antes: `db9efb992fb6acc1f81e0d014d3fbf8aa81085f3`.
- Supabase **kitesurf** `qadkqjfmmnxvovyyhqxw`: ledger 39–42 inalterado. Advisors e ACL de 12 funções consultados somente leitura; detalhes em `docs/AUDITORIA_L0_RPC_PRIVILEGIOS_20261110.md` (PR #137). Oito SECURITY DEFINER executáveis por anon exigem triagem, não revogação indiscriminada; quatro funções sem search_path fixo. Nenhuma migration executada, Protege 3B fechado, checkout desligado.
- PRs de documentação antigas #130/#135 continuam abertas e conflitando; não fazer merge cego. Próxima execução: verificar deploy live de #136, CI/QA da #137; integrar documentação se aprovada e não obsoleta, conferir definições e dependências das oito RPCs e preparar correção mínima testada em PostgreSQL isolado. Priorizar E2E autenticado/Storage quando houver ambiente autorizado. **0/18 frentes integralmente homologadas.**


## Handoff L0 — 10/11/2026, 14h15 BRT

- Render confirmou `dep-dbpk9bbm8hqs739vukv0` **live** para SHA `3ec384d268c089492b1bbe1ca38188bf532cb172` (PR #136).
- PR #137 (auditoria read-only) integrada por squash `e2c1d91d542ccb6adf4d242462c4a04742957ddd`; CI `42854927409` **success**; Claude QA `42854927392` **skipped** (sem revisão independente). Deploy do SHA #137 deve ser conferido antes de marcar publicado.
- SQL real, somente leitura, confirmou quatro funções `notify_booking_message`, `notify_confirmed_booking`, `notify_lesson_incident`, `notify_offer_transition` como SECURITY DEFINER, retorno trigger, vínculo em pg_trigger e EXECUTE para PUBLIC/anon/authenticated. As funções de cotação e `is_admin` não foram alteradas.
- PR #138 adiciona migration 43 **somente versionada** com guardas e teste SQL 93 para revogar EXECUTE dos quatro triggers internos. CI run `42862944435` estava em andamento; Claude QA run `42862944437` **skipped**. Verificar CI no HEAD antes de merge; se falhar, corrigir e reexecutar. NÃO aplicar migration 43 em produção sem validação de dependências e E2E autenticado; migrations 39–42 e trava 41 preservadas.
- Próximas ações: conferir CI/QA #138; revisar impacto em triggers/notificações e baseline isolado; integrar apenas após aprovação; verificar Render SHA live; depois priorizar RLS/Storage e E2E por perfil. Não marcar 18 frentes como homologadas, não ativar checkout ou Protege 3B.


## Handoff — 10/11/2026 15h BRT, CI migration 43

- Render `dep-dbpl1ku417fc7398jdtg` **live** no SHA `e2c1d91d542ccb6adf4d242462c4a04742957ddd` (#137).
- Supabase kitesurf `qadkqjfmmnxvovyyhqxw` mantém ledger **39–42**, sem aplicação da 43; Protege 3B fechado e checkout real desligado.
- PR #138: CI `42863046721` falhou exclusivamente no teste SQL 93 por ambiguidade entre variável PL/pgSQL `oid` e coluna `oid`. Corrigido renomeando a variável para `target_fn` (commit `42331e78d25867580e3dac73999aba15721d1d44`). Conferir novo CI do HEAD antes de merge; Claude QA anterior SKIPPED, nunca presumir revisão.
- A migration 43 continua apenas versionada, não executar em produção antes de avaliação de dependências e E2E autenticado. Continuar RLS/Storage por papel sem modificar dados reais. Issue #105 e #115 atualizadas. **0/18 frentes integralmente homologadas.**


## Handoff L0 — 10/11/2026, 16h BRT

- PR #138 integrada (squash `6a4fd40e637867166f1cf4a25fd2c8c2295ed6a4`), CI `42873566829` success no HEAD `13929938aec6234da45c8b0e76d24cb837b678fe`; Claude QA `42873566449` skipped, **sem revisão independente**.
- Migration 43 somente versionada, **não aplicada**. Supabase kitesurf `qadkqjfmmnxvovyyhqxw` permanece com ledger 39–42. Não executar DDL sem reconciliação e validação; Protege 3B fechado e checkout desligado.
- Render último `live` confirmado nesta execução: `e2c1d91d542ccb6adf4d242462c4a04742957ddd` (`dep-dbpl1ku417fc7398jdtg`). Conferir publicação do SHA `6a4fd40e`.
- Storage consultado somente leitura: seis buckets privados com limites MIME/tamanho; policies `storage.objects` para `authenticated` vinculam proprietário, reserva ou admin. Não equivalem a E2E autenticado. Revisar helpers de Storage e testar acesso cruzado com contas fictícias autorizadas, sem modificar reservas.
- Issue mestre #105 comentário `6776984591` registra resultados e próxima prioridade. **0/18 frentes homologadas**.


## Handoff L0 — 10/11/2026, 17h15 BRT

- Render `srv-dbifnnks728c73f50arg`: deploy `dep-dbpmtv03tm7c73denlk0` **live** em 19:26 UTC, SHA `6229a7f9a73e34b836b17d6dff7eef81bf976542`. Confirma publicação do merge #138 e handoff anterior; não equivale à aplicação SQL da 43.
- Supabase **kitesurf** `qadkqjfmmnxvovyyhqxw`: ledger oficial **39–42 apenas**. Migration 43 versionada e **não aplicada**. Protege 3B permanece fechado; checkout real desativado.
- Consulta SQL somente leitura confirmou quatro funções `SECURITY INVOKER` sem `search_path`: `bookings_snapshot_frozen`, `touch_updated_at`, `reject_change`, `reject_test_payment`. Corpos usam apenas recursos built-in/trigger. PR **#139** prepara migration 44 com guardas e `search_path=pg_catalog`; **nenhuma SQL aplicada ao banco**. CI e Claude QA devem ser verificados no HEAD da PR antes de qualquer merge; não declarar aprovação sem evidência. Migration 44 não deve ser aplicada em produção antes da avaliação isolada e de dependências.
- Próxima execução: verificar CI/Claude QA #139; corrigir falhas; integrar somente após sucesso e revisão independente quando ativa; conferir SHA live. Priorizar testes negativos de Storage/RLS com sessões fictícias autorizadas; ausência de E2E real impede homologação. Não executar 01–38, 43 ou 44 automaticamente. **0/18 frentes integralmente homologadas**.


## Handoff L0 — 10/11/2026, 18h17 BRT (execução horária)

- PR #139 **integrada** após CI do HEAD `27ae2d50f3bec079e8bed27dbb1ff0477ba8508c` **success** (Actions `42893629135`); Claude independent QA `42893629064` **skipped**, portanto **não revisou**. Merge squash `2dcbcf00a3c9527ff2a00dfa77bdf0df58f2ed5c`.
- Render serviço `srv-dbifnnks728c73f50arg`: deploy `dep-dbpoju2vcj2c73dftc7g` do SHA `2dcbcf00` observado **build_in_progress**, não confirmado live. Último `live` confirmado: `6229a7f9a73e34b836b17d6dff7eef81bf976542` (`dep-dbpmtv03tm7c73denlk0`).
- Supabase correto `qadkqjfmmnxvovyyhqxw`: ledger somente migrations 39–42. **43 e 44 apenas versionadas, não aplicadas**. Não alterar dados, pagamentos, Protege 3B (fechado) ou executar migrations antigas.
- Auditoria somente leitura de `pg_policies` em `storage.objects`: políticas de `vento-chat-files`, `vento-protection-evidence`, `vento-instructor-avatars`, `vento-instructor-documents`, `vento-partner-avatars` e `vento-student-avatars` restritas a `authenticated`; filtros de owner, reserva, admin ou helper. Seis RPCs de chat/documentos consultadas, sem EXECUTE para `anon`, com EXECUTE para `authenticated`; isso **não prova isolamento entre usuários**. Não houve teste HTTP com JWTs distintos nem upload/download real.
- Próximo ciclo: confirmar SHA `2dcbcf00` live; reconciliar dependências de migrations 43/44 e testar em PostgreSQL isolado antes de cogitar DDL real; executar matriz E2E negativa com contas fictícias de quatro papéis quando autorizadas, cobrindo `SELECT`, `INSERT`, `UPDATE`, `DELETE` e URLs assinadas; priorizar P0 comprovado. Não homologar Storage por inspeção estática. **0/18 frentes integralmente homologadas**.
