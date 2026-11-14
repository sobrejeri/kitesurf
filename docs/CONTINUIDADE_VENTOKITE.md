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


## Handoff L0 — 10/11/2026, 19h15 BRT (lote de segurança)

- PR #140: CI do HEAD `f83ef108e8fb350cf957f71feda238e932e89d42` **success** (Actions `42903706084`); Claude QA `42903706088` **skipped**, não revisou. Diff somente documentação inspecionado; merge squash `a746063c7b337fef851aa4a964e69e84abd319b4`.
- Render: deploy `dep-dbpoju2vcj2c73dftc7g` do SHA `2dcbcf00a3c9527ff2a00dfa77bdf0df58f2ed5c` confirmado **live** às 21:19:53 UTC. Deploy do merge #140 ainda **não verificado**; conferir antes de declarar publicado.
- Supabase correto `qadkqjfmmnxvovyyhqxw`: ledger oficial ainda **39–42**, 43 e 44 versionadas sem aplicação. Consulta somente leitura confirmou oito SECURITY DEFINER com EXECUTE para anon: `is_admin`, quatro funções internas de trigger `notify_*` e três funções de cotação `quote_*`. As quatro `notify_*` continuam com grants amplos em produção; migration 43 ainda não aplicada. Funções de cotação possuem `search_path` vazio e retornam tabela/previsão de preços; `is_admin` consulta `auth.uid()`, sem evidência nesta inspeção de elevação de privilégio. **Não confundir alertas com exploração comprovada.**
- Não houve alterações de banco, reservas, pagamentos ou dados. Protege 3B permanece fechado pela migration 41; checkout real desligado.
- **Próximo passo P0:** revisar em PostgreSQL isolado as migrations 43 e 44 e dependências dos quatro triggers antes de considerar aplicação individual com autorização; priorizar teste negativo HTTP de Storage/RLS com contas fictícias separadas (Aluno/Instrutor/Admin/Pousada). Sem credenciais de teste e segundo instrutor, marcar E2E **BLOQUEADO**, não homologado. Verificar CI/Claude QA desta nova PR e merge apenas se aprovado; depois confirmar SHA live. Status geral **0/18** frentes homologadas.


## Handoff L0 — 10/11/2026 20h17 BRT

- PR #141: CI `42913011805` SUCCESS, Claude QA `42913011589` SKIPPED (não revisou); merge `6504929e0e385d23543a1612c11ee944a626d55f`.
- Render: commit `a746063c` live no deploy `dep-dbppf8ijnfac739dfs40`; deploy `dep-dbpqcdu0tbcc73fg3dm0` de `6504929e` estava `build_in_progress` na última consulta; não declarar publicado antes de verificar live.
- Supabase kitesurf `qadkqjfmmnxvovyyhqxw`: ledger real 39–42 somente; 43 e 44 versionadas, não aplicadas. Auditoria somente leitura confirmou quatro triggers SECURITY INVOKER ainda sem search_path fixo (`bookings_snapshot_frozen`, `touch_updated_at`, `reject_change`, `reject_test_payment`); `reject_test_payment` mantém EXECUTE para anon/auth, sem prova de exploração. Não houve DDL nem escrita de dados.
- Próxima execução: verificar deploy `6504929e` live; validar 43/44 em PostgreSQL isolado e reconciliar dependências antes de aplicar qualquer SQL; realizar E2E negativo autenticado de Storage/RLS por quatro perfis com contas fictícias quando disponíveis; avaliar EXECUTE de `reject_test_payment` sem revogação cega. Manter Protege 3B fechado, checkout desligado e migrations 39–42 preservadas.
- Issue #105 comentário `6781991112`; #115 comentário `6781991682`. Quatro entregas verificáveis de dez; zero de dezoito frentes homologadas integralmente.


## Handoff L0 — 10/11/2026 21h18 BRT

- PR #142: CI `42922321383` SUCCESS, Claude QA `42922321324` SKIPPED (sem revisão independente); merge `f391ad8d3abdfd2512d61f34fe6ea23d52d8b770`. Verificar deploy deste SHA; último Render `live` observado foi `6504929e0e385d23543a1612c11ee944a626d55f`, deploy `dep-dbpqcdu0tbcc73fg3dm0`.
- Supabase correto `qadkqjfmmnxvovyyhqxw`: ledger real permanece 39–42. Migration 43 e 44 somente versionadas, não aplicadas. Quatro funções `SECURITY INVOKER` de trigger continuam sem `proconfig`; `reject_test_payment` tem EXECUTE anon/auth, mas retorna trigger e está vinculada ao trigger ativo `bookings_test_no_payment` em `bookings`, rejeitando mudança de reserva de teste para `awaiting_payment`. Grant isolado não demonstra bypass; não revogar sem dependências e regressão.
- Revisão estática dos quatro corpos da migration 44 identificou somente OLD/NEW/TG_*, `RAISE` e `now()` built-in, sem referências não qualificadas a tabelas públicas; `search_path=pg_catalog` parece compatível, mas **não equivale a teste PostgreSQL isolado**.
- Handoff: confirmar deploy `f391ad8d` live; validar migrations 43/44 em PostgreSQL isolado com trigger real e testes antes/depois; avaliar aplicação individual após checagens de compatibilidade, sem executar 01–38; testar Storage/RLS com sessões fictícias distintas de Aluno/Instrutor/Admin/Pousada. Sem E2E autenticado e segundo instrutor, homologação BLOQUEADA. Preservar Protege 3B bloqueado e checkout desligado. Issue #105 comentário `6783062958`, #115 `6783063682`. **0/18 homologadas.**


## Handoff L0 — 10/11/2026 22h19 BRT

- PR #143 integrada após CI `42930408234` SUCCESS; Claude QA `42930408225` SKIPPED (não revisou). Merge `3b6e1c23f3f21f753c19ba9865722e2ae146de45`, deploy ainda não confirmado.
- Render `srv-dbifnnks728c73f50arg`: último SHA confirmado LIVE `f391ad8d3abdfd2512d61f34fe6ea23d52d8b770`, deploy `dep-dbpr8kgae00c73fei330`.
- Supabase VentoKite `qadkqjfmmnxvovyyhqxw`: ledger real 39–42 somente; migrations 43/44 NÃO aplicadas. Protege 3B fechado e checkout desativado.
- PR #144 adiciona teste SQL isolado `supabase/tests/94_trigger_search_path.test.sql` para validar os quatro triggers da migration 44 (tipo, SECURITY INVOKER, search_path fixo, vínculo). CI/Claude QA ainda pendentes; não integrar sem CI aprovado. Não equivale a E2E autenticado nem aplicação em produção.
- Issue #105 comentário `6784131347`, #115 `6784132109`. Próxima execução: conferir CI/QA da PR #144, corrigir falhas, integrar se aprovado, confirmar Render; depois executar testes negativos Storage/RLS com contas fictícias separadas dos quatro papéis. Sem E2E real, **0/18 homologadas**.

## Handoff — 10/11/2026 23h12 BRT (L0, PR #147)

- PR #147 `fix/partner-payout-rls-145`: migration 45 corrige `partner_payout_owner_insert` (exige `id = auth.uid()` e existência de `partners.owner_id = auth.uid()`). Não aplicada no Supabase real; policy real ainda usa predicado incorreto `p.owner_id = p.id`.
- CI do commit `3bbdeb6` **success**, run `42943950877`; Claude QA **skipped**, run `42943950922`, portanto NÃO houve revisão independente. O teste SQL foi reforçado no commit `d047af6` para autenticar o usuário sem pousada antes da tentativa negativa. **Aguardar CI do HEAD `d047af6` antes do merge.**
- Render último live consultado `8b20f003b74d38d4ffa9598a2b8911e14702d09d`, deploy `dep-dbpsoqi6ffts739t0q50` (redesign de workspace Instrutor/Admin em paralelo). Não atribuir a PR #147 a esse deploy.
- Próxima etapa: CI do `d047af6`, corrigir se falhar, confirmar Claude QA skipped/ativo, merge apenas com success. Reconciliar ledger real antes de considerar aplicar migration 45; sem alterações em pagamentos ou checkout. Em seguida retomar primeira pendência P0 independente, com E2E autenticado ainda não homologado. Protege 3B fechado, 0/18 homologadas integralmente.

## Handoff L0 — 11/11/2026, execução seguinte

- PR #147 integrada após CI success do HEAD `4efc983bd44beae2924efe679cce02191542f758` (Actions 42944467576); squash `012a1fbfdb6b4b961f2421a33657368710cf9dbc`. Claude QA **SKIPPED** (42944467586), não revisou. Migration 45 versionada, **NÃO aplicada** ao Supabase; ledger real apenas 39–42. Migration 43/44 pendentes: reconciliar ordem e dependências antes de qualquer DDL.
- Render último deploy live consultado: `bdcc0a4f844824ca6a19a57f979c7ef019e5a86b` (02:18 UTC), **não** é o squash #147; confirmar novo deploy antes de afirmar publicação.
- PR #148 adiciona testes transacionais negativos de SELECT/UPDATE entre usuários para dados PIX de pousada; aguardar CI e Claude QA, integrar somente após success. Nenhum pagamento, reserva ou dado real alterado.
- Próxima ação: conferir CI da PR #148 e SHA live Render; se aprovado integrar; depois priorizar correções P0 de autorização/Storage e testes por papel. E2E autenticado e Safari/PWA continuam pendentes. Protege 3B OFF e checkout OFF. 0/18 frentes integralmente homologadas.

## Handoff L0 — 11/11/2026 01h BRT, PR #148

- Confirmado no Render deploy `dep-dbpttj60tbcc73fkgj00` **live**, SHA `012a1fbfdb6b4b961f2421a33657368710cf9dbc` (PR #147). Isso comprova publicação de código, **não** aplicação da migration 45.
- Supabase VentoKite `qadkqjfmmnxvovyyhqxw`: ledger somente 39–42; migrations 43/44/45 continuam versionadas sem aplicação. Protege 3B e checkout continuam fechados. Nenhuma alteração de dados reais nesta execução.
- PR #148 branch `test/l0-partner-payout-cross-owner-20261111`: teste SQL 96 ampliado para negar SELECT, UPDATE **e DELETE** por usuário autenticado estranho; commit `4832f1e20f8e9171127d11c8bdbf917763d70ad5`. Aguardar CI do HEAD e confirmar job Claude QA (documentação indica desativado; não atribuir revisão inexistente). Não integrar sem CI success.
- E2E HTTP autenticado de Storage, segundo instrutor e homologação visual em dispositivo real permanecem pendentes; 0/18 frentes homologadas integralmente. Próximo ciclo: CI/QA #148, corrigir falhas ou integrar se aprovado, conferir Render, avançar testes de RLS/Storage por papéis; reconciliar 43–45 antes de qualquer DDL real. Não ativar pagamentos.


## Handoff L0 — 11/11/2026 02h BRT (PR #148 e teste DELETE)

- PR #148: CI HEAD `dbdc765a` success, run `42957957349`; Claude QA `42957957339` skipped (sem revisão). Merge squash `851ba42917fcb72ba368c2f8e57b8f899d0aa8d8` realizado; verificar Render live deste SHA.
- Auditoria pós-merge encontrou defeito real no teste SQL 96: a seção DELETE tinha caracteres literais `\\n` na linha de comentário, de modo que o CI success **não executava** a asserção DELETE. Branch `test/fix-payout-delete-assertion-20261111`, commit `1025751b`, corrige quebras de linha; aguardar CI do novo PR e corrigir falhas antes de integrar.
- Render último live confirmado `012a1fbfdb6b4b961f2421a33657368710cf9dbc` (#147); ledger Supabase real somente migrations 39–42; 43–45 ainda pendentes. Não aplicar sem revisão do plano de migração, especialmente 43/44, e sem verificar dependências. Protege 3B e checkout permanecem OFF.
- E2E HTTP autenticado com quatro perfis, dois instrutores e Safari/PWA ainda BLOQUEADO por falta de evidência de contas/dispositivos. Zero de 18 frentes homologadas. Próximo: CI novo teste DELETE, merge se success, verificar SHA live e retomar segurança RLS/Storage, não declarar DELETE validado pelo CI anterior.

## Handoff — 11/11/2026 03:13 BRT, PR #149 (lote L0)

- Plano, auditoria L0, QA e issue #105 relidos. Render `srv-dbifnnks728c73f50arg` confirmado **live** no SHA `851ba42917fcb72ba368c2f8e57b8f899d0aa8d8` (PR #148); **não** atribuir publicação à PR #149.
- Supabase **kitesurf** `qadkqjfmmnxvovyyhqxw`: ledger real somente migrations **39–42**. Migrations 43–45 continuam **não aplicadas**. Protege 3B permanece fechado; checkout desligado.
- PR #149: CI do commit anterior `1025751b` **falhou** na asserção DELETE executável: `permission denied for table partner_payout_details` (run `42964428526`). O teste assumia equivocadamente que a role authenticated tinha grant DELETE. Corrigido no commit `48515f4e`: DELETE sob bloco de exceção aceita `insufficient_privilege` ou zero linhas, mas reprova deleção efetiva. Não confundir ausência de grant com prova de RLS.
- Consulta somente leitura ao banco remoto confirmou que `authenticated` tem **somente SELECT** direto em `partner_payout_details`. A política INSERT proposta pela migration 45, ainda não aplicada, não implica automaticamente grant INSERT. Investigar fluxo de gravação via RPC e conciliar grants antes de implantar migrations 43–45; não conceder escrita ampla por suposição.
- CI novo `42971063605` e Claude QA `42971063499` iniciados para `48515f4e`; **resultado pendente nesta anotação**. Claude QA só conta se realmente executar revisão; SKIPPED não conta.
- **Retomada exata:** conferir resultado dos dois jobs para `48515f4e`; se CI success e Claude skipped, integrar PR #149; se Claude ativo, aguardar review e resolver P0/P1; conferir Render live após merge. Depois abrir correção independente P0 para o fluxo de payout/RPC/grants apenas após auditoria de código e schema; não mexer em dinheiro nem em dados reais. Registrar em #105/#102/#145. E2E autenticado real continua bloqueado.
- Entregas concretas desta execução até esta anotação: 1 correção de teste SQL e 1 auditoria remota de grants; documentação é suporte, não conta como implementação.


## Handoff L0 — 11/11/2026, 05h BRT — PR #150

- Render **live** confirmado: `5143ce3152ad125aaad11e3c94da770f87cb8215` (PR #149), deploy `dep-dbq1f1u7bikc738eu060`.
- Supabase VentoKite `qadkqjfmmnxvovyyhqxw`: somente migrations **39–42** registradas; **43–46 NÃO aplicadas**. Protege 3B continua fechado pela 41; checkout desativado.
- Causa funcional #145 **rastreada no código**: `src/app/actions/partner-profile.ts` / `savePartnerPayout` usa `createSupabaseServerClient()` e INSERT/UPDATE diretos em `partner_payout_details`. Não há RPC de gravação nesse fluxo. ACL real de produção concede a `authenticated` somente SELECT; logo migration 45 isolada não habilita o cadastro.
- PR **#150**: migration 46 condiciona GRANT INSERT/UPDATE à policy de owner corrigida da migration 45, sem DELETE/anon; teste SQL reforça grants, UPDATE legítimo e isolamento entre usuários. **Não aplicar migration 46 isoladamente**; aguardar CI e revisar migrations 43–45 antes de aplicação em produção.
- Claude independent QA da primeira execução da PR #150: **SKIPPED**, não houve revisão independente. Não declarar E2E real; 0/18 frentes homologadas.
- Retomar: consultar HEAD e CI atuais da PR #150; corrigir falhas; verificar QA; integrar somente após CI success; conferir Render live. Conciliar migrations 43–46 com schema real e plano de recuperação antes de qualquer DDL. Em seguida avançar P0 RLS/Storage ou reservas. Sem pagamentos ou reservas reais.


## Handoff L0 — 11/11/2026 06h BRT — PR #150 integrada; grants negativos

- PR #150: HEAD `d10a6b6b83e6e2d2732c2ae19487aca83edf1c09`, CI `42986480031` SUCCESS; Claude QA `42986479617` SKIPPED (sem revisão independente). Merge squash `444ab82bc713a7c04a66c120e16c326424545eef`. Aguardar confirmação de deploy LIVE desse SHA; merge não equivale a deploy.
- Render último SHA LIVE confirmado antes do merge: `5143ce3152ad125aaad11e3c94da770f87cb8215`, deploy `dep-dbq1f1u7bikc738eu060`. Supabase correto `qadkqjfmmnxvovyyhqxw`: ledger 39–42 somente; 43–46 versionadas, não aplicadas. Policy INSERT remota ainda contém `p.owner_id = p.id`, e authenticated só possui SELECT na tabela; não declarar cadastro de payout corrigido em produção.
- Nova PR de testes de menor privilégio: branch `test/l0-partner-payout-grant-boundaries-20261111`, reforça teste SQL 96 para negar INSERT/UPDATE/DELETE a anon e DELETE a authenticated. Exigir CI do HEAD e Claude QA antes de merge.
- Próximo ciclo: verificar CI da PR de testes, merge apenas se SUCCESS; confirmar Render LIVE. Reconciliar dependências 43–46 e aplicar individualmente apenas quando seguro, com rollback/plano de recuperação e evidências, nunca 01–38 em lote. E2E autenticado quatro papéis, Storage HTTP e segundo instrutor permanecem BLOQUEADOS. Protege 3B e checkout OFF; 0/18 frentes integralmente homologadas.


## Handoff L0 — 11/11/2026 07h20 BRT

- PR #151 integrada após CI run `42993627252` com job de banco **success**; squash `9db88a06dcf84e4d7fcd8687da00e60af29f4ff0`. Claude QA segue documentado como não ativo; **não houve parecer independente comprovado**. Confirmar deploy `live` do SHA #151 no Render (o último live verificado antes da integração era `444ab82b`, #150).
- Nova PR #152 (branch `test/l0-partner-payout-two-owners-20261111`, commit `032502275d6ba0604a7107f6d9d6996bbea8a41f`) adiciona regressão SQL 96 com duas pousadas legítimas e negativa de leitura/alteração cruzada; **CI pendente**, não integrar sem sucesso.
- Supabase correto `qadkqjfmmnxvovyyhqxw` consultado somente leitura: ledger contém apenas migrations 39–42. Migrations 43–46 **não aplicadas**; conciliar ordem e dependências antes de qualquer DDL remoto. Protege 3B bloqueado e checkout OFF. Nenhum dado real alterado.
- Retomar: CI e Claude QA #152, corrigir se necessário, merge só com CI aprovado, confirmar Render SHA live; avançar reconciliação SQL 43–46 e testes Storage HTTP autenticados quando houver sessões. 0/18 frentes integralmente homologadas.

## Nota de design — 11/11/2026 — Pousada passa a se chamar Afiliado

- Área `/pousada/*` agora é `/afiliado/*` (redirect 307 dos links antigos; `area=pousada` aceito nos links de e-mail; cookie `vento-pousada-auth` mantido). No banco nada mudou: papel `partner` e tabelas `partner_*`. Onde este log diz "Pousada" para papel ou telas, leia "Afiliado". Detalhes em `AUDITORIA_L0_NAVEGACAO_E_DESIGN.md`.

## Correção — 11/11/2026 — links de confirmação e de senha mandavam para localhost

- Encontrado no ar (deploy `8ccc1c0`, mas o código já era assim antes): `/auth/confirm` e `/auth/recovery` respondiam `Location: https://localhost:10000/...`, porque montavam o redirecionamento com `request.url`, que no Render é o endereço interno do servidor. Efeito: depois de clicar no link do e-mail (confirmar conta ou redefinir senha), a pessoa caía numa página que não abre, em todos os apps.
- Correção: os dois redirecionamentos usam `siteUrl()` (`src/lib/env.ts`), baseado em `NEXT_PUBLIC_SITE_URL`, o mesmo endereço que os e-mails já usam. Teste `scripts/test-auth-redirect-origin.mjs` no CI; conferido com `next start` na porta 10000, como no Render.

## Nota — 11/11/2026 — CPF/CNPJ e código do admin (migrations 47 e 48)

- **47** (`account_tax_ids`): CPF ou CNPJ privado de instrutor e afiliado, único por tipo de conta, exigido na primeira aprovação, travado depois (correção só pelo admin, auditada sem o número). **48**: `is_admin()` e `require_role()` exigem sessão `aal2` (código do app autenticador) para admin. As duas são independentes de 43–46 e não são alteradas por elas; o app funciona antes e depois de aplicá-las. Aplicar em ordem, depois que os admins cadastrarem o app autenticador. Detalhes e recuperação de acesso em `ACESSOS_E_CADASTROS.md`.
- `scripts/test-db.sh` neste container precisa de `LC_ALL=C.UTF-8` (com locale POSIX o teste de slug com acento falha antes de qualquer mudança).


## Handoff — 11/11/2026 11h14 BRT (PR #154)

- Render serviço `srv-dbifnnks728c73f50arg`: deploy `dep-dbq744u7bikc738mk560` **live**, SHA `73e14a01560da36842000cf17c45674fd6462f13`. Esse commit externo introduziu cadastro CPF/CNPJ e MFA admin; **não confundir código publicado com migrations aplicadas**.
- Supabase kitesurf `qadkqjfmmnxvovyyhqxw`: ledger consultado **somente 39–42**. Migrations 43–48 **não registradas**. A migration 41 mantém Protege 3B fechado; nenhuma SQL foi executada. A migration 48 é essencial para impor MFA de admin também no banco, mas o procedimento documentado exige cadastrar autenticador de cada admin antes de aplicar; não aplicar às cegas.
- PR #153 integrada, CI `43019740020` **success**, Claude QA `43019740017` **skipped**. Deploy #153 foi substituído pelo SHA `73e14a0` live.
- PR #154 aberta na branch `fix/l0-affiliate-missing-schema-message-20261111`: corrige orientação insegura que mandava usuário executar migration antiga 22; inclui teste automatizado e job no CI. HEAD inicial `f007fd8d1af74c3cade84072f71fc17f45f3a935`. **Aguardar CI/Claude QA do HEAD antes de merge**; sem merge nem deploy confirmado para #154.
- P0 bloqueado por E2E autenticado e conciliação de schema: verificar dependências das migrations 43–48, especialmente MFA admin 48 e CPF/CNPJ 47, sem executar 01–38 nem aplicar DDL sem avaliação. P1 #154 é independente. A identidade aprovada é azul/preto/cinza/branco; a alteração externa verde requer revisão visual.
- Próxima execução: conferir CI/Claude da #154, corrigir e integrar somente se aprovado; confirmar deploy; iniciar correção funcional P0/P1 independente após reconciliar código atual, e registrar evidências na #105. **0/18 homologadas integralmente; checkout desligado.**

## Handoff — 11/11/2026 15h21 BRT (PRs #154 e #155)

- PR #154 integrada após CI `43066576713` **success**, Claude independent QA `43066576636` **skipped** (não revisou); merge SHA `5bb9ae242223bb3daf8af14d22ca5f362c8fd373`. Render iniciou deploy `dep-dbqb3r8u01pc73b2lfsg` em `build_in_progress`; **não marcar live antes de confirmar**.
- Nova PR #155 (`fix/affiliate-avatar-owner-preflight-20261111`, HEAD `3229f286cd65f8d3cc39395cadf7373884afcd5a`) corrige upload legado de avatar do afiliado: verifica registro `partners` por `owner_id` antes de gravar no Storage; teste de regressão e CI. **Aguardar CI e Claude QA do HEAD, sem merge antecipado.** E2E autenticado Storage continua pendente.
- Supabase projeto correto `qadkqjfmmnxvovyyhqxw`: ledger oficial somente 39–42; SQL manual 47/48 possui evidência de objetos presentes, mas sem registro no ledger. Não reaplicar, reconciliar baseline e confirmar políticas/RLS e sessão aal2 reais. Não executar 01–38. Protege 3B permanece fechado pela 41; checkout OFF.
- Próximo: confirmar CI #155, integrar somente se aprovado; verificar SHA live do #154 e depois #155; continuar P0 E2E autenticado e correções independentes P1. **0/18 frentes integralmente homologadas.**


## Handoff — 12/11/2026 00h BRT — sandbox #101

- PR #161 integrada após CI success `43140389532`, merge SHA `55d151574308dafbc916ace97b1977b99af5a04d`. Claude QA `43140389569` SKIPPED; não houve revisão independente. Render `dep-dbqitfqjnfac73bjlhcg` em `build_in_progress` na consulta inicial; confirmar `live` antes de declarar publicação.
- PR #162 (branch `feat/sandbox-payment-events-20261112`, commit inicial `56170f28bfd0424955f0a2ef69cca95518237612`) adiciona reducer puro de eventos sandbox Pix/cartão, idempotência por event ID, transições seguras, testes e CI. Aguardar CI e Claude QA (não presumir aprovação); integrar somente com CI success e confirmar Render.
- Sandbox ainda NÃO possui webhook assinado, persistência transacional, verificação de propriedade, conciliação Mercado Pago, reembolso parcial nem split 1:N comercial. Nenhum pagamento ou repasse real foi ativado.
- Supabase correto `qadkqjfmmnxvovyyhqxw` mantém migrations 39–42; Protege 3B fechado. Issue #105 registra ponto de retomada e #101 detalhes financeiros. Priorizar PR #162, PR QA #157 sobre #156, e correções P0/P1 não financeiras independentes.

## Handoff — 12/11/2026 01h BRT (sandbox #101)

- PR #162 integrada após CI success (run 43146825191), squash `94e847a9742f90f6b6958b681e782859f89637fe`; Claude QA `SKIPPED` (run 43146825211), sem revisão independente.
- Render último `live` confirmado `55d151574308dafbc916ace97b1977b99af5a04d` (deploy `dep-dbqitfqjnfac73bjlhcg`); não declarar #162 live sem verificação posterior.
- PR #163 criada com reconciliação sandbox pura e testes de regressão; aguardar CI, sem merge prematuro. PR #156 conflitada e #157 com CI em fila; resolver após validação.
- Supabase kitesurf migrations 39–42; Protege 3B fechado; nenhuma SQL nem transação real nesta rodada. 0/18 frentes homologadas.
- Retomada: verificar CI e QA da #163, corrigir e integrar somente se aprovado, confirmar deploy live, depois avançar segurança de webhooks e autenticação. Issues #101/#105 contêm evidências.

## Handoff — 12/11/2026 02h BRT (#101)

- PR #163 integrada após CI success (run 43154270803), squash `acd6b2c46fa9730865d50312538f7869e87a250d`; Claude QA SKIPPED, sem revisão independente.
- Render confirmou #162 `94e847a` live no deploy `dep-dbqjt449v7es73do82eg`. Confirmar #163 live separadamente.
- PR #164 introduz verificação HMAC de assinatura Mercado Pago em módulo sandbox puro e regressões CI. Aguardar CI/QA, não integrar antes da aprovação. Ainda não existe endpoint de webhook autenticado, persistência de idempotência ou conciliação real com PSP.
- PR #156 conflitada, PR QA #157 com CI queued; resolver sem contornar checks. Supabase kitesurf migrations 39–42; Protege 3B fechado; checkout e dinheiro real desligados. 0/18 frentes homologadas.
- Retomar: CI/QA #164, Render #163, autenticação #156/#157 e próximo P0 seguro. Evidências nas issues #101/#105.

## Handoff — 12/11/2026 03h BRT (#101)

- PR #164 integrada após CI success `43160519857`, squash `66b01cdc77971b093b2104e4c27a130707ca56f3`; Claude QA `43160519861` SKIPPED (não revisou).
- Render #163 `acd6b2c` confirmado live no deploy `dep-dbqknpnf3r2c73f9s570`. Deploy #164 `dep-dbqljk7f3r2c73fas3s0` estava `build_in_progress` e precisa nova conferência.
- PR #165 criada com preflight puro de inbox de webhook e testes de colisão/replay, CI adicionado; não confundir com idempotência persistente/transacional. Aguardar CI/QA do HEAD `c40e34a` antes de merge.
- #156 conflitada e #157 com CI queued; preservar correção de QA, reconciliar com branch atual e validar. Supabase VentoKite migrations 39–42; Protege 3B fechado, checkout real desligado, nenhuma SQL ou pagamento real alterado. 0/18 homologados.
- Próximo: verificar CI/QA #165, Render #164, resolver #157→#156 e implementar persistência atômica de eventos em ambiente isolado; issues #101/#105 registram evidências.

## Handoff — 12/11/2026 04h BRT (#101/#105)

- PR #165 (`ba50cc7`) CI `43167143005` success, Claude QA `43167143024` SKIPPED (não revisou); integrada no SHA `2297d6de7e726fcf1e5d2b8bc565235319098482`. É somente preflight puro de inbox; **não** implementa persistência transacional.
- Render VentoKite `srv-dbifnnks728c73f50arg`: SHA `66b01cdc77971b093b2104e4c27a130707ca56f3` (#164) confirmado live em `dep-dbqljk7f3r2c73fas3s0`. Novo deploy #165 ainda não confirmado nesta rodada.
- Supabase correto `qadkqjfmmnxvovyyhqxw`: ledger 39–42 confirmado; não aplicadas migrations. Protege 3B fechado, checkout real desativado.
- PR #166 criada sobre o SHA integrado da #165 com serializador CSV seguro contra fórmulas e teste Node executado localmente; workflow atualizado. **Aguardar CI/Claude QA** antes de merge; não representa endpoint nem autorização server-side.
- PR #156 segue aberta; QA #157 (`5e711d9`) continua com workflow `43096919035` queued na consulta, não integrar sem resultado. Próxima rodada: verificar CI #166, Render #165, conciliar #157→#156, depois priorizar implementação P0 não financeira e idempotência persistente isolada. 0/18 frentes integralmente homologadas.


## Handoff — 12/11/2026 07h BRT (#89/#105)

- Render `srv-dbifnnks728c73f50arg`: PR #166 SHA `0348d02b4038373dd04bbbfdee9fc9fa4d56d24d` confirmado **live** no deploy `dep-dbqo6eijnfac73bpn0a0`.
- Supabase **VentoKite** `qadkqjfmmnxvovyyhqxw`: ledger oficial 39–42, nenhuma migration aplicada nesta rodada; não executar 01–38. Protege 3B e checkout real fechados.
- PR #156 possui conflito com a base atual, embora o job verify do run `43189611464` tenha passado. Para preservar a correção e evitar merge conflitado, criada PR #167 `fix/auth-site-url-fallback-rebased-20261112`, a partir da base live, com `src/lib/env.ts` e `scripts/test-auth-redirect-origin.mjs` da #156 após incorporar o ajuste de lint da #157.
- PR #167: HEAD de código `516009ab25cd04344bd5e40bf225d24b6938636e`; Claude QA run `43198514714` **SKIPPED** (não revisou); CI run `43198514754` estava em andamento. Este commit documental posterior exige verificar o CI do **HEAD final** antes de merge. Nenhum deploy da #167; E2E autenticado de confirmação e recuperação ainda pendente.
- Próximo: aguardar CI da #167, corrigir falhas, confirmar Claude QA no HEAD final; integrar apenas com CI success e verificar SHA live no Render. Depois reconciliar/fechar #156 como substituída, continuar P0 de autorização por perfil e persistência transacional em ambiente seguro. **0/18 frentes integralmente homologadas**.

## Handoff — 12/11/2026 08h BRT (#89/#102)

- PR #167 integrada após CI success no HEAD `a747a372` (run 43198584911); Claude QA SKIPPED (43198584607), sem revisão independente. Merge SHA `41ec5b3e66289996027592cecddd75c8fa4bb976`.
- Render iniciou deploy `dep-dbqq2j8473hc738ajvng` para #167; estava `build_in_progress` na última consulta, portanto ainda não confirmado live. Último SHA confirmado live `0348d02b` (#166).
- PR #168 aberta na branch `fix/auth-site-url-relative-only-20261112`, reforçando `siteUrl()` contra redirecionamentos externos/protocol-relative e caracteres de controle, com regressão em `scripts/test-auth-redirect-origin.mjs`. CI do HEAD ainda sem resultado; NÃO integrar até verificar CI success e Claude QA. Esta alteração não afeta dados nem pagamentos.
- PR #156 antiga permanece aberta/conflitada e foi funcionalmente substituída por #167; não integrar a antiga. Supabase migrations 39–42 mantidas, Protege 3B e checkout real fechados, 0/18 frentes homologadas; E2E autenticado por perfil pendente.
- Próximo: verificar CI/QA da #168, corrigir se necessário, integrar somente após aprovação, confirmar Render #167 e depois #168 em SHA separado; avançar P0 de autorização por perfil e Storage ou idempotência transacional sandbox. Não criar PR de docs isolada.

## Handoff — 12/11/2026 09h BRT (#102, PR #168)

- CI do HEAD `3c908d9c` da PR #168 falhou no lint (`src/lib/env.ts:32`, `no-control-regex`), run 43208644639. Typecheck passou, demais testes foram pulados por falha antecipada. Claude QA run 43208644709 SKIPPED, sem revisão.
- Correção funcional segura no commit `846f0dfcc75e08fc98beacd554233f30a4a44bb6`: detecção de controles ASCII por código de caractere em `siteUrl()` sem regex proibida, preservando o bloqueio de redirecionamento externo. **Verificar CI do HEAD após este handoff** antes de merge. Não houve merge/deploy da #168.
- Render confirmou PR #167 `live`: SHA `41ec5b3e66289996027592cecddd75c8fa4bb976`, deploy `dep-dbqq2j8473hc738ajvng`. Supabase kitesurf: ledger 39–42, sem alterações. Protege 3B e checkout real fechados.
- Issue #89 aparece CLOSED embora E2E autenticado por quatro perfis não esteja concluído; não tratar como frente homologada. Total 0/18. Retomada: CI/QA do HEAD da #168, merge somente se aprovado, deploy SHA exato e depois autorização por perfil/Storage. Evidências: issue #105 comentário 6823427341 e #102 comentário 6823429134.

## Handoff — 12/11/2026 10h BRT (fluxo principal #90/#92/#103)

- PR #174 `fix/booking-package-allocation-20261112` inclui código e regressão da distribuição exata 4h = 2h + 2h. HEAD antes deste handoff `166eb53f848cb204cf6f881c923b7ff5900c1376`; CI run `43226068342` em andamento e Claude QA `43226068351` SKIPPED. **Após este commit documental, conferir CI no HEAD final** antes de integrar. Não publicado.
- Supabase `qadkqjfmmnxvovyyhqxw`, consulta somente leitura: migrations 39–42 presentes; 5 perfis, 6 solicitações, 6 reservas, 8 encontros, **somente um instrutor**. `pg_cron` não instalado e `cron.job` ausente; função `advance_instructor_offer(uuid)` existe. Fila offline e A→B→C **não homologadas**.
- Último Render live consultado `0c2a5f827fbc3e6f492c3f39923985455d25f641`, deploy `dep-dbqrk7nf3r2c73fikt30` (#172). Nenhum E2E autenticado Aluno → 4h/2 encontros → Instrutor aceita/registra minutos/evolução → Aluno confere foi executado nesta rodada; depende de sessões autorizadas e dados isolados. Não alterar reservas existentes.
- Próximo: CI do HEAD final #174 → merge se aprovado (Claude QA SKIPPED não é aprovação) → Render SHA live. Em paralelo preparar validação segura de scheduler/fila sem ativar jobs pagos nem alterar dados. Registrar evidência nas issues #90/#92/#103/#105. Checkout real e Protege 3B fechados, **0/18 frentes homologadas**.


### Retomada 12/11/2026 — fuso explícito na validação de encontros (#178)
- PR #178 `fix/booking-explicit-timezones-20261112`: `src/lib/student-schedule.ts` rejeita timestamps locais sem offset na comparação de horários; regressões em `scripts/test-student-schedule.mjs` cobrem Ceará/UTC e microssegundos do PostgreSQL. **Não considerar publicada antes de CI, merge e SHA Render live.**
- Banco Supabase `qadkqjfmmnxvovyyhqxw` verificado em consulta somente leitura: 3 buscas expiradas, 0 ofertas pendentes expiradas, `pg_cron=false`. Migrations 39–42 presentes no ledger. Não ativar cron ou executar funções mutantes sem plano/validação.
- Render último deploy observado live: `dep-dbqs7sk9v7es73e31n20`, SHA `7a9cf0209444b303ee9c6665708b7cd6bb46ee9e` (#177). Claude QA ainda exige verificação de job por SHA, sem presumir aprovação.
- **Bloqueio E2E:** cenário autenticado Aluno → 4h/2 encontros → aceite Instrutor → presença/minutos/evolução → Aluno confere não foi executado nesta rodada: não há sessão de navegador autenticada autorizada disponível por este conector. É preciso executar no ambiente de homologação com contas/sessões de teste e reserva isolada, sem alterar dados existentes.
- Próximo: conferir CI/Claude do HEAD #178, merge se CI PASS e QA desativado, conferir deploy SHA exato; então avançar testes de fila offline, conflito concorrente e E2E. Checkout real e Protege 3B continuam fechados. 0/18 homologadas.


## Retomada 12/11/2026 — validação de calendário (#178/#180)
- PR #178 CI `43235744379` **SUCCESS**, Claude QA `43235744456` **SKIPPED** (não revisou), merge `2b1cd0abbec0afaf8c8ef45ad79ba63b2a76d35b`. Na última consulta Render live `82051ffc5fdb365b43cb0b7b8d975e18177005a4` (#179), anterior ao merge #178; confirmar deploy do SHA #178 antes de afirmar publicação.
- PR #180 `920da5eaf126e1076bb7197b4f349682f025bbcf`: corrige aceitação de datas impossíveis normalizadas pelo JavaScript no validador compartilhado e adiciona testes de ano bissexto/24h. Aguardar CI do HEAD e verificar Claude QA antes de merge. Sem migrations, sem alterações de reservas reais.
- E2E autenticado de 4h/2 encontros **não executado**: esta execução não possui sessões autenticadas de aluno e instrutor de homologação. Requer contas de teste autorizadas com sessão de navegador e reserva de teste; não simular aprovação. Fila A→B→C também depende de pelo menos 3 instrutores de teste e execução comprovada do agendador sem navegador; pg_cron ausente na última auditoria.
- Retomar: (1) CI #180 e QA; (2) merge apenas com CI verde e QA conforme configuração; (3) Render SHA live; (4) priorizar E2E autenticado e scheduler da fila #90–#94/#103; (5) manter checkout real e Protege 3B fechados. **0/18 frentes homologadas.**


## Execução 12/11/2026 — 13:18 BRT (fluxo principal)
- Confirmado Render LIVE SHA `2b1cd0abbec0afaf8c8ef45ad79ba63b2a76d35b` (PR #178). PR #180 CI PASS run `43245941108`, Claude QA SKIPPED; merge squash SHA `b9e98c633936895c93748b0a69c5e2af5d56035e`, **deploy desse SHA ainda não confirmado**.
- PR #181: complemento de validação de horários absolutos, rejeita segundos 60 e offsets com horas/minutos impossíveis; testes em `scripts/test-student-schedule.mjs`. Aguardar CI e Claude QA do HEAD; sem merge/deploy até CI aprovado.
- Migrations reais Supabase projeto `qadkqjfmmnxvovyyhqxw`: ledger 39, 40, 41 e 42, preservadas; não houve DDL ou mutação de dados nesta execução.
- E2E Aluno 4h/2 encontros → aceite Instrutor → presença/minutos/evolução → conferência Aluno segue **não executado**: conector não dispõe de sessão autenticada de navegador de homologação; exigir contas/sessões de teste isoladas. Fila A→B→C exige múltiplos instrutores de teste e scheduler comprovado. Não declarar homologação. 0/18.
- Próximo: verificar CI/Claude da PR #181; merge se PASS e QA SKIPPED, conferir SHA live sequencialmente no Render; depois atacar fila offline e conflitos concorrentes. Checkout real OFF; Protege 3B fechado.

- 12/11 14:xx BRT — PR de continuidade `fix/booking-offset-boundary-20261112`: limita offsets ISO de encontros a ±14h (14h somente com minuto zero), testes de limites +14:00/-12:00 e rejeição +15:00/-14:01. PR #181 foi integrada com CI verde e Claude QA SKIPPED; merge SHA `46e2c96c6ce557cd85454f8fb52ed8430985689d`, deploy `dep-dbqv88nf3r2c73aev5v0` estava `build_in_progress` na última consulta. Não há E2E autenticado aprovado. Retomar CI desta nova PR, QA e merge/deploy somente se aprovados; depois atacar scheduler/fila #92/#103 e cenário 4h/2 encontros #90. Sem mexer em checkout ou Protege 3B.

## Handoff 13/11/2026 — reserva 4h/2 encontros, regra por dia
- PR em preparação: bloquear no servidor dois encontros da mesma reserva no mesmo dia, mesmo quando horários não se sobrepõem. Teste automatizado cobre 4h/2 datas válidas e duplicação de data. A validação atômica de reservas concorrentes permanece no banco.
- E2E autenticado Aluno/Instrutor ainda pendente de sessões de homologação e fixtures isoladas. Protege 3B e checkout real seguem fechados. Supabase migrações 39–42; 43 não aplicada. Não afirmar deploy antes do Render live.

## 13/11/2026 — instructor start fail-closed
- Correção de segurança em PR: remover fallback de `start_ordered_meeting` para `start_meeting`. Se função ordenada faltar, retornar erro explícito sem iniciar encontro; preserva ordem e janela de 24h imposta no PostgreSQL. Regressão no CI verifica ausência do fallback. Sem DDL nem mudança em pagamentos. E2E autenticado ainda pendente.

## 13/11/2026 14h BRT — PR #203: testes isolados do worker de fila
- PR #203 (`test/queue-worker-http-contract-20261113`) testa execução do handler POST real em VM isolada com mocks Supabase e NextResponse, sem rede ou credenciais. Casos: desativado, autenticação inválida, segredo ausente, falhas de SELECT, lote com duas solicitações, erro parcial RPC.
- CI do HEAD inicial `37607d47` falhou no passo `Test student schedule conflicts and evolution destinations` (run 43469014779): `ReferenceError: Cannot access 'URL' before initialization`, devido a constante de teste que sombreava a classe global `URL`. Corrigido no commit `4689ecd` com renomeação para `SUPABASE_URL`; aguardar novo CI completo e Claude QA (último job `skipped`), revisar eventuais falhas e integrar somente se verde.
- Último Render live verificado: `4df219beceb9257d458417b987eb88ac34189fa3` (PR #202), deploy `dep-dbrjo4m7bikc73f5012g`. #203 ainda NÃO publicado.
- Homologação real Aluno 4h/2 encontros → Instrutor aceite/presença/minutos/evolução → Aluno confere permanece bloqueada por ausência de sessões autenticadas e fixtures isoladas. Fila A→B→C exige três instrutores de teste e disparo offline homologado. 0/18 homologadas. Worker OFF, checkout real OFF, Protege 3B fechado, migrations 39–42 preservadas.
- Próximo: conferir CI de `4689ecd`; se falhar, corrigir teste e repetir. Após merge e Render live, implementar teste de concorrência/seleção deduplicada em isolamento, sem executar RPC em dados reais.

## 13/11/2026 15h BRT — hardening worker #92
- Render deploy PR #203 `dep-dbrkbbtg1s2s73cklfe0` confirmado `live` no SHA `1cad1dd0d7c0a576481777be0cb6bad7886efbef` às 14:17 BRT; testes de handler com mocks publicados, **não** E2E offline.
- Branch `fix/queue-worker-selection-failclosed-20261113`: worker retorna 500 se consulta sem erro vier com `data=null` (não fingir fila vazia), evita RPC duplicada no mesmo lote e rejeita identificadores ausentes com 503; regressões com Supabase simulado.
- Antes do merge verificar CI do HEAD e status Claude QA real (workflow skipped não é aprovação); depois verificar SHA live sequencialmente.
- Bloqueio E2E P0: sem sessão autenticada de Aluno e Instrutor de homologação e reserva 4h/2 encontros isolada acessível, não executar alterações em reservas existentes. Fila offline A→B→C requer 3 instrutores de teste aprovados, job externo homologado, revisão das 4 buscas e 3 ofertas antigas. Sem scheduler habilitado, checkout OFF, Protege 3B fechado. 0/18 frentes homologadas.
- Próximo passo independente após este hardening: testar servidor e banco com fixtures isoladas para reserva 4h/2 encontros, conflito concorrente e início/presença/evolução; evitar PR apenas de documentação.

## 13/11/2026 16h BRT — execução automatizada (prioridade fluxo principal)
- PR #204 integrada com CI `43482247081` SUCCESS e Claude QA `43482246738` SKIPPED, merge SHA `620d545eed8cf7a25cb413ca8b7e816abf6042f1`. Deploy Render `dep-dbrm6pm1egvs73a3btrg` ainda `update_in_progress` na última consulta; **não declarar live antes de verificar**.
- Nova PR #205 (`test/instructor-meeting-actions-isolated-20261113`, HEAD `7bf0184892165c5ee15b1edb4a61d85fe995a9f7`): testes isolados das ações reais do instrutor `startMeeting` e `recordMeetingWithSkills`, cobrindo PIN, RPC ordenada, minutos, evolução e erros; incluídos no CI, aguardando resultado. Claude QA job `43491732207` SKIPPED. Sem acesso a dados reais ou mutações.
- **Retomar:** verificar CI da PR #205; corrigir falhas e reexecutar; integrar somente com CI verde e QA conforme status; confirmar sequencialmente deploy live #204 e depois #205. Em paralelo, avançar #90/#103 com teste isolado de reserva 4h/2 encontros e validação de permissões, sem criar reservas reais.
- **E2E bloqueado:** não há sessões autenticadas autorizadas de Aluno e Instrutor nem fixtures isoladas comprovadas para completar reserva 4h/2 encontros, aceite, PIN, minutos, evolução e conferência. Fila A→B→C exige 3 instrutores de teste e scheduler homologado; manter worker OFF. 0/18 tópicos homologados, checkout real OFF, Protege 3B fechado, migrations 39–42 preservadas.

## 13/11/2026 16h+ BRT — testes isolados das duas pontas do fluxo
- PR #205 (`test/instructor-meeting-actions-isolated-20261113`) CI `43491789741` SUCCESS, Claude QA `43491789812` SKIPPED; integrada no SHA `0be121e0e03d6145895eeb0d9f14e2568a2bb0f4`. Render live deste SHA ainda precisa confirmação.
- PR seguinte `test/student-booking-four-hours-isolated-20261113`: executa a ação real de criação da reserva com Supabase simulado e a regra real de horários; prova distribuição 4h/2 datas, rejeição de dias repetidos, horas incompatíveis, data inválida e conflito com aula/busca existente. Não é E2E autenticado nem testa transação concorrente real.
- Retomar pelo CI desta PR e publicar somente com CI verde; confirmar Render SHA #205 e depois da nova PR. A seguir atacar #91 concorrência transacional e #94 reagendamento/cancelamento com fixtures isoladas. Faltam sessões de Aluno/Instrutor autorizadas para E2E real; 0/18 homologados. Worker OFF, checkout OFF, Protege 3B fechado, migrations 39–42 preservadas.

## 13/11/2026 — início dos testes #94 de reagendamento
- PR #206 CI `43492192314` SUCCESS e Claude QA `43492192281` SKIPPED, integrada SHA `176f58120a483f544dd71677651a6115ff2327d0`. Deploy `dep-dbrm9ftbedkc73bi1bo0` aguardava publicação na última consulta.
- Branch `test/meeting-change-actions-isolated-20261113`: teste isolado da ação real de reagendamento, valida datas impossíveis/passadas, prazo de 72h, fuso -03:00, aceite/recusa, opção de substituir instrutor e erro de RPC. Aguardar CI/merge/deploy; não equivale a E2E de cancelamento/agenda.
- E2E autenticado 4h/2 encontros ainda exige contas/sessões de Aluno e Instrutor e fixture isolada; 0/18 homologados. Checkout real OFF, Protege 3B fechado, worker OFF, migrations 39–42 preservadas.


## Rodada 13/11/2026 — guarda de agenda e PR #212

- PR #209 CI `43492713154` SUCCESS, Claude QA SKIPPED, merge `470f7a7d262d58149cc72d27d32d5fdd3b269286`; deploy Render `dep-dbrmu8p42hec73cd4r60` confirmado LIVE.
- PR #210 CI `43499418993` SUCCESS, Claude QA SKIPPED, merge `29a4816f531186fe81caa9eb93bc703e979332c9`; deploy Render `dep-dbrmv6pv1jhc73ddiocg` confirmado LIVE.
- PR #212 (agenda ocupada) CI anterior `43499994379` FAIL por TS18047; correção no HEAD `c3ca987a7d430dbe071a5c46e832c0162b7c8139`, CI `43500317290` SUCCESS, Claude QA `43500317159` SKIPPED. Merge `68dbd36ff6a20e7d67707d39b6380673ee56abfb`. **Deploy deste merge ainda não confirmado LIVE** na última consulta. O código trata `data: null` sem erro explícito como falha, não como agenda vazia, em três consultas.
- Testes das PRs são isolados, não comprovam transação concorrente no banco nem E2E autenticado 4h/2 encontros. **0/18 homologados integralmente.**
- Próximo passo: verificar deploy do SHA `68dbd36f` no Render; só avançar se estiver LIVE. Depois montar fixture isolada de duas sessões simultâneas e três instrutores para validar conflitos e fila A→B→C (#91, #103). Sem executar RPC mutante nos dados reais, sem ligar worker/checkout, sem migrations adicionais ou alterar Protege 3B.

## 13/11/2026 — rodada 18h (P0 agenda, PR #214 e #215)
- Rechecados os quatro documentos do plano, issue #105, migrations reais Supabase `20261110001348` (39), `20261110001427` (40), `20261110003527` (41), `20261110012944` (42). Nenhuma migration nova executada. Protege 3B fechado.
- PR #214: CI `43504984544` SUCCESS, Claude independent QA `43504984704` SKIPPED (sem revisão Claude); merge `5e689c266f97f972477dbd2fd82a933397acbb67`. Render `dep-dbrnr9tg1s2s73cqqt9g` estava BUILD_IN_PROGRESS na consulta, NÃO afirmar live. Corrige falha de formato de JSON da fila em `getStudentOccupiedSlots`, com quatro regressões.
- PR #215: `fix/occupied-booking-timestamp-20261113`, bloqueia `created_at` inválido em reserva `awaiting_payment` para evitar liberar agenda por comparação `NaN`; três regressões. Aguardar CI, conferir Claude QA (SKIPPED não é aprovação), merge apenas com CI verde, confirmar Render SHA live.
- E2E autenticado Aluno 4h/2 encontros → Instrutor aceita/registra presença/minutos/evolução → Aluno consulta ainda NÃO executado por falta de sessões autenticadas/fixture segura de aluno e instrutor; nenhuma aprovação E2E. 0/18 tópicos homologados. Testes de concorrência transacional e fila A→B→C também pendentes. Checkout real OFF, worker OFF, sem alterações financeiras ou dados reais.
- Retomada exata: verificar CI da PR #215, merge se verde, validar deploy de #214 e #215 por SHA; em paralelo desenvolver fixture isolada de concorrência e fluxo multi-encontro, sem tocar produção real.

## 13/11/2026 — rodada 19h (agenda e homologação)
- PR #215 HEAD `0ac6b5ac` CI #43508949121 SUCCESS, Claude QA #43508949235 SKIPPED; merge `0920e5809c1d6df2a6bf3daf4857698b0d202ad7`. Confirmar Render LIVE para esse SHA antes de declarar publicado.
- Novo bloqueio tratado em branch `fix/occupied-meeting-payload-20261113`: linhas malformadas de `booking_meetings` antes retornavam como horários; agora a leitura falha fechada, com quatro casos de regressão. PR e CI pendentes na abertura desta anotação.
- Supabase projeto `qadkqjfmmnxvovyyhqxw`: migrations reais 39–42 presentes. Leitura somente: 5 perfis, 7 reservas, 9 encontros, 9 solicitações; não modificar dados reais.
- E2E autenticado aluno 4h/2 encontros → aceite instrutor → presença/minutos/evolução → consulta aluno permanece sem evidência: não há sessões autenticadas e fixture isolada autorizada/validada para completar a jornada. Testes unitários/SQL não equivalem a E2E. 0/18 homologados integralmente.
- Próximo: CI da nova PR, merge somente após success, verificar SHA live, preparar fixture transacional isolada de concorrência e jornada autenticada sem tocar produção ou pagamentos. Protege 3B/worker/checkout real OFF.

## 13/11/2026 20h19 BRT — #91 corrida real isolada, PR #219
- Rechecados plano, continuidade, auditoria L0, guia Claude QA e #105; Render live `7ed6771f12becba63b7f48c1f69de537b9133c6f` (PR #218). Claude QA SKIPPED (não revisou).
- CI #43525297408 e #43525623168 falharam somente na nova corrida SQL: ambos estudantes receberam `NO_INSTRUCTOR`. A primeira fixture usava nível `returning` e data +40d; a segunda +6d mas ainda nível `returning`. Ajustado para nível `first_time` igual aos cenários de aprovação do instrutor no `10_rules.test.sql`, commit `1015c121ffb21054c36b9e75d547d82d8ab3f497`. **Aguardando novo CI**, sem alegar teste aprovado ou duplicidade corrigida.
- PR #219 adiciona duas conexões SQL simultâneas e assertiva de uma única reserva para praia Jeri com único instrutor Rafael; só integrar se CI verde e QA verificado. Se continuar `NO_INSTRUCTOR`, inspecionar elegibilidade de perfil e disponibilidade da fixture e corrigir teste; se ambos aceitos, investigar atomicidade da reserva no banco.
- E2E autenticado 4h em dois encontros, aceite, presença, minutos, evolução e consulta do aluno ainda sem sessões de teste comprovadas; 0/18 homologados. Fila A→B→C exige 3 instrutores aprovados em ambiente isolado e scheduler validado. Checkout real/worker/Protege 3B continuam fechados. Nenhuma migration nem dado real alterado.
- Próximo ponto: verificar CI do HEAD `1015c121` da PR #219; em caso de sucesso, merge com SHA esperado e conferir deploy live; em caso de falha, ler logs e corrigir causa concreta. Depois avançar #90/#93/#103 com jornada SQL multi-encontro isolada.

## 13/11/2026 21h15 BRT — P0 fila offline, PR #225
- Plano, continuidade, auditoria L0 e #105 relidos. Render LIVE confirmado em SHA `e2a136152c27cc4624a42fdef17eb6cd7c1237fa` (PR #224), deploy `dep-dbrq3jm417fc73epmcl0` às 20h50 BRT. Migrations reais Supabase: somente 39–42, versões 20261110001348, 20261110001427, 20261110003527, 20261110012944; não executadas nesta rodada.
- Auditoria somente leitura confirmou que `advance_instructor_offer(uuid)` é SECURITY DEFINER, já usa lock por request e seleção de instrutores com SKIP LOCKED; EXECUTE permitido a service_role e negado a anon/authenticated. Não invocar sobre reservas reais.
- PR #225 `feat/offer-expiry-runner-20261113` adiciona POST `/api/internal/expire-offers` protegido por segredo bearer de 32+ caracteres, limite 10, consulta de vencidos e modo preview padrão. Exige explicitamente `VENTO_OFFER_WORKER_ENABLED=true` e `VENTO_OFFER_WORKER_APPLY=true` para mutar; **nenhuma das flags foi ativada**, nenhum cron instalado. `SUPABASE_SERVICE_ROLE_KEY` só no servidor. Teste estático de travas executado no prebuild. CI/Claude QA e merge/deploy ainda por verificar.
- **Retomar:** checar CI/Claude QA #225, corrigir se falhar, merge apenas após verde e review independente se ativo, conferir SHA LIVE. Antes de habilitar worker: inventariar as 4 buscas/3 ofertas vencidas, implementar scheduler autorizado e testar offline A→B→C com 3 instrutores fictícios em DB isolado. O endpoint ainda não trata buscas searching sem oferta vencida e prazo futuro; ampliar cobertura após teste de fila. E2E autenticado 4h/2 encontros segue bloqueado por sessões e fixture isolada; 0/18 homologados. Checkout real e Protege 3B fechados.

## 13/11/2026 22h15 BRT — rodada P0 #92/#93/#103, PRs #226 e #227
- Quatro documentos obrigatórios e #105 relidos. Render confirmou LIVE SHA `c9be116ff9c4f38b54fffed3799f82ce977165ab` (#225), deploy `dep-dbrqi3p5efls73e1mn6g`. Ledger Supabase `qadkqjfmmnxvovyyhqxw` contém somente migrations 39–42; nenhuma aplicada nesta rodada. SELECT agregada confirmou 5 buscas e 4 ofertas vencidas, 1 instrutor aprovado; nenhum registro alterado.
- PR #226 corrige ordem não determinística no worker protegido: consulta por `expires_at` crescente, união e deduplicação estáveis, limite 10; flags continuam desativadas, sem cron. CI `43539377253` em andamento na abertura; Claude QA `43539377235` SKIPPED. Não afirmar integração nem publicação sem nova consulta.
- PR #227 adiciona testes SQL com papéis autenticados: aluno e instrutor não designado não podem gravar minutos/evolução. CI `43539401570` iniciado; Claude QA `43539401552` inicialmente em andamento, verificar se review efetivo ou SKIPPED antes de merge. Nenhum dado real alterado.
- Bloqueios: falta ambiente/sessões autenticadas e 3 instrutores fictícios isolados para E2E Aluno→4h/2 encontros→aceite→presença→evolução→Aluno e fila A→B→C; testes SQL isolados não equivalem a E2E browser. Executor offline não agendado/ativado; manter 0/18 tópicos homologados, checkout real e Protege 3B fechados.
- Retomar: consultar CI e Claude QA das PRs #226/#227; corrigir falhas, integrar somente verde, conferir SHA LIVE de cada merge. Depois criar fixture isolada A→B→C e testar expiração, recusa, aceite sem scheduler de produção; priorizar #90–#94/#103. Não executar migrations 01–38 nem processar as ofertas reais vencidas.

## 13/11/2026 23h18 BRT — P0 fluxo 4h/2 encontros, CI e pendências
- Leitura inicial obrigatória realizada: plano, continuidade, auditoria L0, QA Claude, issue #105, migrations reais e Render. Ledger real Supabase Kitesurf apenas 39–42; nenhuma migration executada. Último LIVE no início: #227 SHA `fd2def9469773f022adc56b4c632c91d37f8046a`.
- PR #228 integrada: SHA `05a5da7310bc92114b990dcef3c015ee2651413c`; CI `43545385739` SUCCESS com testes SQL isolados de bloqueio de UPDATE direto do progresso por aluno/instrutor estranho e limite de 120 minutos no segundo encontro. Claude QA `43545385704` SKIPPED, não houve revisão Claude. Deploy #228 requer confirmação LIVE.
- Próxima PR desta rodada testa soma de minutos visível ao aluno (225 de 240 contratados) e isolamento do agregado de outro aluno; validar CI e QA, merge somente verde, depois SHA LIVE.
- Supabase produção somente leitura: 1 instrutor aprovado, 5 buscas searching vencidas, 4 ofertas offered vencidas. Não processar esses dados nem ativar executor/cron. Sem sessões autenticadas de homologação nem três instrutores fictícios isolados, o E2E real Aluno→4h/2 dias→aceite→presença→minutos/evolução→Aluno continua NÃO homologado; 0/18 frentes completas.
- Retomar após CI/deploy: construir teste A→B→C com três instrutores isolados, rejeição/expiração/aceite, corrida concorrente e reagendamento; só então buscar E2E navegador com contas autorizadas. Checkout real e Protege 3B permanecem fechados.

## 14/11/2026 00h20 BRT — P0 #92/#93/#103, PRs #230/#231
- PR #230 integrada SHA `868e701bf54917ff89406790726f51780e6ef1ad`, CI `43550745752` SUCCESS, Claude QA `43550747012` SKIPPED. Teste SQL isolado agora prova que só instrutor designado lê os dois encontros e que cada encontro preserva nota e minutos (110+115). Deploy #230 em andamento na última leitura; último LIVE confirmado #229 SHA `7e106146`.
- Leitura somente de `pg_get_functiondef(public.advance_instructor_offer(uuid))` revelou P0: instrutor preferido pulava `instructor_can_attend`, podendo receber oferta em horário indisponível. PR #231 adiciona migration nova `20261114002000_fix_preferred_instructor_availability.sql` e teste de regressão; não aplicada no Supabase. CI `43551004577` aguardando; Claude QA `43551004559` SKIPPED.
- Ledger real Supabase Kitesurf preserva apenas migrations 39–42; 1 instrutor aprovado, 5 buscas e 4 ofertas vencidas, nenhum dado mutado. Não ligar worker/cron nem processar pendências reais. E2E browser autenticado 4h/2 encontros e A→B→C com três instrutores continuam sem fixture/sessões comprovadas. 0/18 homologados; Protege 3B e checkout real fechados.
- **Retomar:** confirmar CI #231; se verde, merge com SHA esperado e verificar Render LIVE; conferir necessidade e segurança de aplicar migration 43 em ambiente autorizado, sem execução automática no banco real; construir teste funcional isolado A→B→C e obter sessões autenticadas de teste. Se CI falhar, corrigir primeiro. Atualizar #92 e #105 com evidências.

## 14/11/2026 01h17 BRT — fixture A→B→C em CI isolado
- Último LIVE confirmado Render: PR #231 SHA `428f82bcddc45c06e98d0f78ec63cfbc40bac5e3`, deploy `dep-dbrt7am8bjmc73dtkh1g`. O SQL da migration #231 ainda NÃO está aplicado no Supabase real (ledger só 39–42), portanto correção de disponibilidade do instrutor preferido não está ativa no banco real.
- PR #232: `scripts/test-offer-queue-abc.sh` e inclusão no `scripts/test-db.sh`. Exercita três instrutores fictícios em PostgreSQL descartável: A recusa, B expira, C aceita, 3 ofertas distintas, 1 reserva, idempotência. Primeiro CI falhou por colisão de identidade fictícia já existente; fixture corrigida no HEAD `1e2c911eeca1fbdf2c6b16b092796873292a7531`, novo CI `43555857832` aguardando. Claude QA anterior SKIPPED; verificar novo run antes de merge.
- E2E navegador autenticado de 4h/2 encontros permanece pendente por ausência de sessões autorizadas acessíveis. Não marcar 18 tópicos como concluídos; 0/18. Não ativar cron, processar ofertas vencidas, executar migrations antigas ou movimentar dinheiro.
- Retomar: verificar CI e QA da #232; se falhar, ler logs do job SQL e corrigir; se verde, merge com SHA esperado, conferir Render LIVE; validar A→B→C no banco descartável; em seguida #94 reagendamento/cancelamento e conflitos concorrentes. Produção só recebe migration nova após conciliação explícita.

## 14/11/2026 01h22 BRT — P0 fila A→B→C e reagendamento
- PR #232 integrada SHA `f1fc3bef90b78610c25f84edbcf378a7ea466399`, CI `43556099239` SUCCESS: três instrutores fictícios em banco descartável, A recusa, B expira, C aceita; exatamente três ofertas, uma reserva, idempotência. Claude QA SKIPPED. Render deploy #232 `dep-dbru3ce7bikc73ef4ot0` em compilação na última verificação; último LIVE #231 SHA `428f82bcddc45c06e98d0f78ec63cfbc40bac5e3`.
- PR #233 adiciona regressão isolada de reagendamento: aluno autenticado reserva e confirma aula fictícia, impede acesso de outro aluno, impede antecipação, exige aceite do instrutor designado, preserva reserva/horas. Aguardar CI e QA; não integrar sem verde.
- Supabase real somente migrations 39–42, a correção SQL #231 não está aplicada. Não tocar nas buscas/ofertas reais vencidas, nem ativar cron. E2E navegador real de 4h/2 encontros ainda sem sessões autorizadas acessíveis, 0/18 homologados.
- Retomar: conferir CI #233 e corrigir falhas; merge só se verde; verificar deploy LIVE de #232 e #233 separadamente; depois validar prazos de 72h/12h, conflitos e cancelamento em banco descartável. Protege 3B e dinheiro real fechados.

## 14/11/2026 01h24 BRT — cutoff 72h e continuidade
- PR #233 integrada SHA `ac181fd0da73f129053047d7cc97ac70ec7c7346`, CI `43556293356` SUCCESS, Claude QA SKIPPED. Reagendamento autenticado isolado aprovado, incluindo bloqueio de antecipação e de acesso cruzado; Render #233 deploy `dep-dbru4du417fc73etiba0` ainda aguardava confirmação LIVE. PR #232 SHA `f1fc3bef90b78610c25f84edbcf378a7ea466399` LIVE deploy `dep-dbru3ce7bikc73ef4ot0`.
- PR #234 acrescenta fixture separada de aula confirmada com menos de 72h para provar rejeição de solicitação de reagendamento e ausência de pedido persistido. Aguardar CI/QA antes de merge; corrigir falhas no teste sem tocar banco real.
- Banco Supabase real continua com ledger 39–42; migration #231 nova ainda não aplicada. E2E navegador 4h/2 encontros e fila real seguem pendentes por falta de sessões de teste autorizadas e isolamento de dados. 0/18 homologados. Não ativar dinheiro real, cron nem Protege 3B.
- Próximo: verificar CI #234, merge somente verde, Render SHA LIVE; ampliar testes de prazo 12h/decisão do aluno e conflito concorrente, preservar reserva. Registrar na issue #105.

## 14/11/2026 01h27 BRT — expiração 12h e continuidade
- PR #234 integrada SHA `f7b6ab324edd60526a08f4dc0c415fdaa259d43a`, CI `43556576742` SUCCESS, Claude QA SKIPPED; valida cutoff de 72h em fixture descartável, após corrigir teste inicialmente dependente de disponibilidade próxima. Render #234 deploy `dep-dbru6068bjmc73dug7c0` aguardava LIVE; #233 SHA `ac181fd0da73f129053047d7cc97ac70ec7c7346` LIVE deploy `dep-dbru4du417fc73etiba0`.
- PR #235 acrescenta teste SQL descartável: pedido de alteração sem resposta é expirado por `expire_meeting_change_requests()`, abre janela de escolha de 12h ao aluno e preserva a reserva confirmada/instrutor. Não ativa cron de produção; aguardar CI e Claude QA (SKIPPED se desconectado) antes de merge.
- Banco Supabase Kitesurf real mantém ledger 39–42; migration #231 de disponibilidade do instrutor preferido ainda não aplicada, portanto P0 permanece no banco real. E2E browser 4h/2 encontros ainda não realizado por ausência de sessões autenticadas acessíveis. 0/18 tópicos homologados. Não tocar dinheiro, Protege 3B, cron ou ofertas reais vencidas.
- Retomar: CI #235, corrigir se necessário, merge só verde, confirmar SHA LIVE de #234/#235, depois testar conflito concorrente e janela final de 12h com decisão do aluno, priorizando #90–#94/#103.

## 14/11/2026 02h18 BRT — P0 #94/#103, decisão pós-expiração
- Documentos de plano, continuidade, auditoria L0, Claude QA e issue #105 relidos. Render confirmou LIVE SHA `b2a9ed8498930f52603cb19fb7755b4551c9100c` (#235), deploy `dep-dbru6n19aqoc739kuts0`, concluído em 14/11 04:31:09Z. Banco real Kitesurf mantém exclusivamente migrations 39–42; migration nova de disponibilidade do instrutor preferido (#231) **não** aplicada ao banco real. Nenhum dado real alterado.
- PR #236 `test/expired-choice-rls-idempotent-20261114` adiciona regressão SQL isolada: reexecutar `expire_meeting_change_requests()` não pode renovar prazo de 12h nem mudar estado expired; RLS deve permitir ao aluno proprietário visualizar a decisão e impedir outro aluno. CI e Claude QA precisam ser conferidos antes de integrar; não declarar verde sem execução.
- E2E autenticado completo 4h/2 encontros no navegador segue **não realizado** por ausência de sessões acessíveis e fixture autorizada; testes SQL não substituem homologação real. Fila real tem ofertas vencidas e worker sem ativação; não executar RPC de avanço em produção. Protege 3B e dinheiro real fechados; 0/18 homologados.
- Retomar: conferir CI/Claude QA #236, corrigir falhas; merge só com CI verde e revisão independente se ativa, verificar SHA LIVE. Em seguida avançar teste concorrente/reagendamento e obtenção de sessões autenticadas autorizadas, sem tocar dados reais.

## 14/11/2026 02h21 BRT — P0 #91 corrida de 4h/2 encontros
- PR #236 integrada SHA `0d4766b9bc546e7db9c1e40dfa4b33ab0f711c29` após CI `43560914365` SUCCESS (incluindo SQL descartável); Claude QA `43560914354` SKIPPED, não houve revisão independente. Render #236 requer confirmação LIVE.
- Próxima PR de teste modifica `scripts/test-concurrent-instructor-booking.sh`: duas sessões autenticadas concorrentes solicitam a **mesma reserva de 4h em dois dias**; apenas uma pode persistir, com exatamente dois encontros no instrutor. Usa slots realmente elegíveis e PostgreSQL descartável, sem acessar banco real. Aguardar CI/Claude QA antes de merge.
- Banco real só migrations 39–42, migration #231 não aplicada. E2E autenticado navegador ainda não realizado; 0/18 homologados. Nenhuma reserva real/cron/checkout/Protege 3B alterado.
