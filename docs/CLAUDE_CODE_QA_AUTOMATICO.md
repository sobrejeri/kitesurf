# Claude Code como avaliador independente de cada etapa do VentoKite

**Objetivo:** o ChatGPT implementa lotes/PRs do VentoKite; **Claude Code audita, testa, reproduz bugs e cria PRs isoladas de correção**. O Claude não substitui o CI, não aprova seu próprio código e não publica diretamente em produção.

## Estado da integração

- [x] Subagente versionado: `.claude/agents/vento-qa-reviewer.md`.
- [x] GitHub Actions preparado: `.github/workflows/claude-qa-review.yml`, disparos ao abrir/atualizar/reabrir/marcar PR pronta.
- [x] Permissões separadas, branch `qa/claude-pr-<numero>-<slug>` para corrigir bugs e PR de correção **contra a branch da PR original**.
- [x] Regras de segurança: checkout desligado, não tocar em pagamentos ou Supabase real, não fazer deploy nem merge, sem custos adicionais sem autorização.
- [ ] **AINDA NÃO ATIVO:** falta autenticação da Anthropic, instalação da Claude GitHub App e optar por ativar a variável `VENTO_CLAUDE_QA_ENABLED=true`. Enquanto estiver ausente, o job é pulado; não haverá chamadas ao Claude nem custo de tokens por esse workflow.
- [ ] Homologar uma PR de teste para comprovar que Claude realmente publicou revisão/achados no GitHub. Não marcar revisor como operacional apenas por CI do arquivo de configuração.

A autenticação via `CLAUDE_CODE_OAUTH_TOKEN` usa limites/custos associados à conta Anthropic. Alternativa via `ANTHROPIC_API_KEY` exige adaptar o workflow e pode gerar cobrança de API. Não pressupor que a conta do ChatGPT dá direito a créditos do Claude.

## Prompt principal para colar no Claude Code

> Você será o **Claude QA Reviewer** do projeto VentoKite (`sobrejeri/kitesurf`), não o desenvolvedor principal. Seu único trabalho é revisar de forma independente cada etapa entregue pelo ChatGPT, reproduzir bugs, testar fluxos e produzir correções isoladas em PRs próprias, **sem alterar a branch de produção**.
>
> Leia inicialmente `AGENTS.md`, `docs/PLANO_ENTREGA_VENTOKITE_SEM_CHECKOUT.md`, `docs/CONTINUIDADE_VENTOKITE.md`, `docs/AUDITORIA_L0_NAVEGACAO_E_DESIGN.md`, `.claude/agents/vento-qa-reviewer.md` e a issue mestre `#105`. Consulte PRs e commits reais. Verifique **o diff completo, dependências e arquivos adjacentes**, não apenas o resumo de quem escreveu a mudança.
>
> Para cada PR nova/atualizada, analise P0/P1/P2, RLS, IDOR, segurança de `SECURITY DEFINER`, autoria e permissões por Aluno/Instrutor/Admin/Pousada; execução e registro de aulas, horário e fila, cancelamento, chat, fotos e uploads, responsividade iPhone/PWA e PC, botões, fontes, cores, contraste, estados de erro e navegação. Preserve a identidade visual já escolhida. Não confunda revisão estática com teste de tela real.
>
> Rode `pnpm typecheck`, `pnpm lint`, `pnpm build` e regressões existentes. Se mexer em SQL, use `bash scripts/test-db.sh` em banco isolado. Documente comandos que realmente passaram, falharam ou ficaram bloqueados. Para cada bug confirmado, escreva teste que reproduz o defeito, faça a **menor correção na branch `qa/claude-pr-<n>-<assunto>`** e abra PR de QA apontando para a branch da PR original. Nunca dê merge, deploy, force push ou aplique migrações na produção.
>
> Publicar feedback independente na PR original, com severidade, `arquivo:linha`, reprodução, impacto, testes e link da PR de correção. Se encontrar P0/P1, marque a implementação **REPROVADA até correção e nova revisão**. Se não encontrar defeitos reproduzíveis, marque **APROVADA COM RESSALVAS**, indicando o que não foi testado. Atualize ou sugira atualização da issue `#105`.
>
> Não execute pagamentos reais, PIX, split, estornos, liberação de saldo, exclusão de dados, reset, criação de serviços pagos ou alterações das migrations já aplicadas (39–42). Mantenha a migration 41 fechando a etapa Protege 3B. Não imprima segredos, dados de clientes ou evidências privadas. A meta é **PRONTO PARA INTEGRAR CHECKOUT**, não checkout ativo.
>
> Reavalie automaticamente novas PRs quando a integração estiver conectada, mas não exija que o usuário intervenha a cada etapa. Mantenha a separação entre **quem implementa** e **quem audita**. Seja rigoroso: não concorde por conveniência, não invente resultados e não aprove uma entrega com falhas críticas.

## Integração automática no GitHub — configuração uma vez

1. Instalar a **Claude GitHub App** com acesso ao repositório `sobrejeri/kitesurf` (exige permissão de administrador da organização/repositório).
2. No repositório: **Settings → Secrets and variables → Actions → Secrets**, adicionar `CLAUDE_CODE_OAUTH_TOKEN` da conta Claude Code. O token deve ficar **somente no secret**; nunca commitado. A ação também pode usar uma API key da Anthropic se o workflow for alterado explicitamente para este modo.
3. Depois de avaliar custos e limites, em **Settings → Secrets and variables → Actions → Variables**, criar `VENTO_CLAUDE_QA_ENABLED` com o valor literal `true`.
4. Abrir ou marcar como pronta uma PR fictícia do próprio repositório para conferir, em **Actions**, o job `VentoKite - Claude independent QA` e, no PR, o comentário de revisão. Só depois registrar o QA como **ATIVO** na issue #105.
5. Quando o Claude estiver ativo, **não integrar automaticamente** uma PR de desenvolvimento só porque o CI passou: aguardar a revisão independente, incorporar PR de correção eventualmente gerada e reexecutar CI. Se a integração não estiver ativa, não declarar revisão Claude concluída.

**IMPORTANTE:** o job de QA está limitado a PRs **do mesmo repositório e não draft**; branches `qa/claude-pr-` não disparam esse revisor para evitar recursão. O job tem limite de tempo de 45 minutos e `--max-turns 12`; isso limita o volume de trabalho, mas não garante um custo fixo. Rever permissões e configuração de billing antes de ativar.

## Resumo do workflow esperado após ativação

```text
ChatGPT implementa na branch feature
             │
             ├── CI existente (TypeScript, lint, build, SQL isolado)
             └── Claude Code QA (revisão independente, em paralelo)
                       │
                       ├── Sem bug confirmado → parecer e ressalvas
                       └── Bug confirmado → teste de regressão + branch qa/*
                                                + PR de correção separada
             │
             ├── Corrigir e revalidar CI + QA
             └── Integrar/deploy somente após critérios de aceitação
```

As rotinas de ChatGPT e Claude podem operar em paralelo **em branches distintas**, mas nenhuma ferramenta desta configuração cria execução contínua sem agendamento/PR, elimina limites de serviços ou substitui testes de navegador autenticados.

## O que deve ser registrado no quadro #105

Para cada etapa: PR do ChatGPT; SHA; CI PASS/FAIL; Claude QA status (DESATIVADO, EM REVISÃO, REPROVADO, APROVADO COM RESSALVAS, BLOQUEADO); achados P0–P3; PRs de correção; deploy live; testes E2E reais; pendências. Nunca misturar "CI passou" com "Claude aprovou".
