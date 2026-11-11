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
