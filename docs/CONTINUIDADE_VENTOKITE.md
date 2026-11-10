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

## Handoff operacional — 10/11/2026, lote L0 (QA)

- PRs QA #134, #131 e #133 integradas na branch de produção, commits `0da632a`, `b522d50`, `db9efb9` (nesta ordem). CI das branches de origem passou; **CI do SHA final e deploy live ainda não confirmados** no momento do registro. Último Render `live` observado: `64281e26`; deploy do SHA `db9efb9` estava `queued`.
- PR #132 retargetada para produção e marcada pronta, mas `mergeable=false`: reconciliar conflitos da navegação de `/aluno/solicitacao/[id]` com #131; testar e integrar só após CI válido.
- Claude Code QA automático permanece sem evidência de ativação operacional. As PRs acima são correções independentes feitas manualmente pelo Claude, não aprovação automática do job.
- Supabase `qadkqjfmmnxvovyyhqxw`: ledger real somente migrations 39–42; preservar 41 e Protege 3B OFF. Checkout e dinheiro real desativados; nenhuma alteração de banco nesta execução.
- Próxima execução: conferir CI e Render live do SHA final; resolver #132; seguir P0 de autorização/Storage HTTP e E2E autenticado ou P1 independente se bloqueado. Não marcar homologação: **0/18 frentes completas**.
- Evidência central: comentário `6768259812` na issue #105.
