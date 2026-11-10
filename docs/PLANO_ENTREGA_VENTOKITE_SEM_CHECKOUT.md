# VentoKite — execução integral até PRONTO PARA INTEGRAR CHECKOUT

**Plano de execução autônoma assistida · 09/11/2026 · Referência viva:** [issue mestre #105](https://github.com/sobrejeri/kitesurf/issues/105). Repositório `sobrejeri/kitesurf`, branch principal de produção `claude/cool-ride-x47z5c`. App: `https://vento-kitesurf.onrender.com`, Supabase projeto `qadkqjfmmnxvovyyhqxw` (não confundir com Turiva).

## Resultado contratado / definição de pronto

**Objetivo:** entregar quatro áreas (Aluno, Instrutor, Admin, Pousada) funcionais, consistentes e testadas em mobile/PWA e desktop, com todas as funções **não financeiras** integradas e documentação suficiente para conectar o checkout em uma etapa posterior.

**Fora de escopo agora:** integração de gateway real, credenciais do PSP, transação PIX/cartão, captura de pagamento, split financeiro real, liberação de saldo, estornos e webhooks financeiros em produção. O código deve permanecer no modo de validação sem checkout; não fingir que um pagamento foi efetivado. A parametrização financeira pode ficar preparada, mas não ativada.

**Só concluir quando houver evidência, não por aparência:** PR integrada, CI aprovado, commit publicado em Render (`live`), ausência de vulnerabilidade P0 conhecida, comportamento real testado com cada papel necessário (não apenas SQL simulado), telas responsivas verificadas e lista de regressões registrada. Reportar honestamente o que não pode ser verificado por limitações de ferramentas/dispositivos.

**Estado verificado ao abrir o plano:** quadro #105 mostra 0/18 frentes integralmente homologadas; PR #122 (`b04a138`) publicada no Render; Supabase migrations 39–42 aplicadas, incluindo bloqueio de quatro RPCs do Protege pela migration 41 e correção de IDOR em `booking_balance_minutes` pela 42. Existem quatro reservas de teste e apenas um instrutor registrado no projeto; não chamar isso de teste autenticado de troca de instrutor.

## Regras permanentes de autonomia, segurança e qualidade

1. **Executar diretamente quando for seguro**, sem solicitar confirmação para cada tela, teste, commit, PR, revisão de layout ou deploy de código não financeiro compatível com as referências aprovadas.
2. **Não executar atos irreversíveis/destrutivos sem verificação pontual:** excluir dados/usuários, reset de banco, reprocessar pagamento, criar serviços com custo, publicar informação privada ou alterar regras comerciais importantes. A autorização genérica de desenvolvimento não elimina obrigações de segurança e controle.
3. **Toda migração:** comparar schema real, versionar SQL, testar em PostgreSQL isolado, verificar DDL, aplicar somente alterações necessárias não destrutivas no projeto correto, confirmar RLS/grants e fazer teste pós-aplicação com contagens; nunca rodar automaticamente a sequência antiga 01–38 sem reconciliar baseline. Registrar versão real Supabase.
4. **Deploy:** abrir PR, esperar CI `success`, integrar, confirmar no Render que o SHA correto ficou `live`; se falhar, interromper a liberação e corrigir/reverter de modo auditável.
5. **Dados e pagamentos:** usar fixtures fictícios ou transações `ROLLBACK`, evitar manipular reservas reais; não alterar dinheiro, comissões efetivas nem checkout.
6. **Segurança por padrão:** contas/papéis isolados, autorização por owner em banco/RPC/Storage, ausência de acesso retroativo na troca de instrutor, rate limit, idempotência, trilha de auditoria, retenção legal; nenhuma conta de teste deve ter permissão herdada de conta real.
7. **Autonomia de design com referências existentes:** não descartar as telas mobile aprovadas; refinar o restante e manter uma única identidade visual. Produzir evidências antes/depois quando ferramentas e sessão visual permitirem; não declarar revisão visual concluída só por análise de JSX/CSS.
8. **Controle único:** em cada tarefa atualizar issue específica (#87–#104, #109 e #115 quando relevantes), este plano e o quadro #105, preservando histórico e distinguindo `Implementado`, `CI aprovado`, `Deploy live`, `Homologado` e `Pendente`.

## Direção visual obrigatória

- **Identidade VentoKite:** preto, azul, cinza e branco; azul como principal acento; logotipo e ícone de kite/duas ondas conforme referência visual já escolhida. Não reutilizar cor laranja do marketplace Turiva.
- **Mobile:** preservar o padrão das telas aprovadas do Aluno, com navegação inferior consistente, foto circular, densidade equilibrada, imagens nítidas e gestos sem troca errada da aba ativa.
- **Desktop:** experiência própria de navegador, mais espaço horizontal e colunas úteis; base preferencialmente branca com detalhes azuis, cards equilibrados, carrossel lateral quando acrescenta valor. Não ampliar fontes ou painéis a ponto de parecer protótipo.
- **Tipografia:** evitar fontes excessivamente mecânicas; títulos expressivos, texto legível e hierarquia clara. Componentes reutilizáveis de botões/tags/inputs, foco e hover, mensagens de erro reais, confirmação e estados vazios.
- **Imagens:** alta resolução, proporções consistentes (1:1 onde os cards e referências aprovadas exigem), crop intencional, fallback adequado, carregamento rápido. Não usar mídia de baixa qualidade, duplicar logo nem cobrir fotos com elementos.
- **Acessibilidade:** contraste, áreas de toque, teclado/foco, aria labels, formulários, redução de movimento, visualização em telas pequenas e zoom, avisos legíveis no Safari/PWA.
- **Checklist por tela:** responsividade mobile/desktop, navegação correta, loading/empty/error, botões executam a ação certa, autorização por papel, visual antes/depois quando possível, teste de dados e status, sem sobreposição/corte.

## Sequência de entrega por lotes (não abrir checkout antes do lote final)

### L0 — Base segura, referências e inventário visual (P0)
**Abrange:** #87, #88, #89, #100, #102, #103.

- [ ] Confirmar GitHub/Render/Supabase, SHA em produção, dependências, CI, migrations 39–42 e variáveis do modo sem checkout (não divulgar segredos).
- [ ] Mapear rotas/telas/ações dos quatro papéis e estados de autenticação, navegabilidade mobile + PC e códigos de referência aprovados.
- [ ] Identificar referências mobile aprovadas e pontos de redesign: cabeçalhos, fontes, cards, botões, cores, imagens e menus; criar checklist visual específico por tela.
- [ ] Consolidar plano de recuperação, inventário e baseline das migrations antigas 01–38 sem executar reset nem pagamentos.
- [ ] Corrigir primeiro qualquer P0 real de autenticação, IDOR, funções `SECURITY DEFINER`, Storage ou reserva. Separar alertas falsos positivos dos reais.
- [ ] Preparar homologação reproduzível em contas fictícias/autorizadas; sem um segundo instrutor de teste **não** afirmar E2E de substituição validado.

**Aceite do lote:** CI e deploy reproduzíveis, riscos P0 inventariados, telas mapeadas e ambiente de QA seguro definido.

### L1 — Reserva, calendário, disponibilidade e fila (P0)
**Abrange:** #90, #91, #92.

- [ ] Aluno escolhe nível, horas e encontros; configurar preço por nível pelo Admin, sem checkout real. Seleção por horas exatas e confirmação apenas quando soma completa.
- [ ] Bloquear dias anteriores, dupla reserva do mesmo aluno no mesmo horário, instrutor indisponível, conflitos concorrentes e situações limite de fuso.
- [ ] Fila A→B→C, oferta atômica, aceite/recusa, expiração com usuário offline, idempotência, reatribuição, sem deixar aluno preso.
- [ ] Homologar telas e mensagens de estados, filtros, botões, calendário e versão desktop.

**Aceite:** fluxo completo de contratação simulada, sem conflitos, com autenticação de Aluno/Instrutor/Admin.

### L2 — Aula, execução, saldo, regras de prazo e Protege (P0)
**Abrange:** #93, #94, #109, #102.

- [ ] PIN/QR, início de aula conforme 24h, registro de minutos e competências por encontro, progresso e nível, saldo parcial e reposição sem novo preço.
- [ ] Bloquear duplicação de encontro e status inválidos; testes multi-encontro, finais, cancelados e instrutor substituído.
- [ ] Reagendamento e cancelamento: antecedência, 72h, respostas em 12h, fallback da fila, somente postergar datas onde previsto; nenhum atraso cria pagamento.
- [ ] Homologar Protege: relatos versionados e imutáveis, avaliação Admin, privacidade, bucket privado e links assinados; manter migration 41 e flag 3B fechadas até testes reais e política de retenção revisada.
- [ ] Nenhum silêncio, expiração de prazo, relato ou decisão automática pode disparar repasse, reembolso ou confirmação de presença.

**Aceite:** jornada de aulas e disputas verificadas com sessões reais, sem operações financeiras, banco e documentos íntegros.

### L3 — Chat, notificações e operação Admin/Pousada/Transporte (P0/P1)
**Abrange:** #95, #96, #97, #98, #99.

- [ ] Chat flutuante tipo Messenger para Aluno/Instrutor, bolinha com foto, lidas/visto/online, imagens/documentos, localização autorizada, vínculo da reserva, privacidade entre conversas.
- [ ] Expiração/retries/scheduler de notificações, estados online/offline, alertas de oferta, cancelamento e agendamento; garantir que processos executam mesmo sem navegador aberto.
- [ ] Admin: permissões, aprovação por seção de cadastro, selo verificado, preços/comissões configuráveis, relatórios e auditoria; evitar ações financeiras reais.
- [ ] Pousada: perfil e aprovação, avatar, indicação por link/QR, regra de primeira compra representada sem dinheiro real.
- [ ] Transporte: frota/capacidade, hora, disponibilidade, conflito de agenda, resumo da contratação e preço correto.
- [ ] Refinar todas as telas mobile/PC, botões, mensagens, menus e responsividade conforme o guia visual.

**Aceite:** fluxos operacionais por perfil com erros, estados vazios, arquivos e offline testados.

### L4 — Revisão visual completa, acessibilidade, PWA e regressões (P0/P1)
**Abrange:** #87, #89, #100, #103.

- [ ] Inventário total de telas (Aluno, Instrutor, Admin, Pousada) e versões mobile/desktop; ajustar layouts respeitando telas aprovadas.
- [ ] Verificar links, botões, carrosséis, loading, erros, cabeçalhos, logo, tipografia, estados de status, contraste e fontes.
- [ ] Testar login/logout e permissão entre perfis, anexos, armazenamento, conexão instável, iPhone Safari/PWA, Android quando acessível e desktop.
- [ ] CI: typecheck, lint, build, regressões JS, SQL isolado, navegação automatizada/E2E autenticado quando houver browser e credenciais fictícias.
- [ ] Revisar segurança final, documentação, logs, custos e caminhos de recuperação; eliminar P0 e P1 antes de declarar pronto.
- [ ] Entregar relatório com PASS/FAIL/BLOQUEADO por tela e cenário, PRs, migrations, SHA live, bugs restantes e pendências de ambientes reais.

**Aceite:** todas as frentes exigidas para uso sem checkout com evidência de homologação, sem incidentes críticos conhecidos.

### L5 — Expansão educacional e preparação da conexão financeira
**Abrange:** #104 e preparação de #101.

- [ ] Laboratório 3D do kite, equipamentos, hotspots informativos, montagem no personagem, interação funcional e bom desempenho mobile/PC; manter dependências visuais revisadas.
- [ ] Congelar contratos internos de pedidos, preços, pagamentos simulados, comissões e resultados de status para futura integração, com validação server-side e idempotência testada sem dinheiro.
- [ ] Documentar a integração do PSP em separado. A aprovação final deste plano é **PRONTO PARA INCLUIR O CHECKOUT**, não `checkout integrado`.

## Regra de aprovação da entrega

`FINALIZADO PARA CHECKOUT` só após:
- [ ] todas as rotas e ações não financeiras do escopo testadas em sessões dos quatro perfis;
- [ ] CI completo e deploy de código `live` no SHA aprovado;
- [ ] UX mobile/desktop verificada, inclusive imagens/botões/cores/estados e navegação;
- [ ] ausência de vulnerabilidades P0 conhecidas, Storage com autorização confirmada e configurações seguras;
- [ ] Supabase migrations aplicadas com ledger correto, sem apagamento de dados e com plano de recuperação;
- [ ] relatório final legível com evidências e pendências estritamente financeiras;
- [ ] checkout real e operações financeiras continuam desativados.

## Continuidade entre conversas

O agente **não consegue abrir um chat novo ou continuar trabalhando indefinidamente sem uma nova execução**. A retomada pode acontecer por um comando único: ver `docs/CONTINUIDADE_VENTOKITE.md`. Nunca confiar no último resumo isolado: primeiro consultar #105, arquivos do repositório, últimas PRs, CI, migrations e status real do Render/Supabase. Retomar pela primeira tarefa P0 que estiver realmente pendente, sem repetir migrações já aplicadas.


## Avaliador paralelo: Claude Code QA (configuração opcional)

- Instruções: `docs/CLAUDE_CODE_QA_AUTOMATICO.md`; agente: `.claude/agents/vento-qa-reviewer.md`; workflow: `.github/workflows/claude-qa-review.yml`.
- **Responsabilidades independentes:** ChatGPT desenvolve e publica PRs; Claude revisa os diffs, testes, bugs e qualidade visual com rigor, registra P0/P1/P2 e pode criar uma PR de correção `qa/claude-pr-*` **somente contra a PR auditada**, sem merge ou deploy.
- **Ativação depende de autenticação e opt-in:** instalação da Claude GitHub App, secret `CLAUDE_CODE_OAUTH_TOKEN`, variável `VENTO_CLAUDE_QA_ENABLED=true`. Configuração inicialmente desativada, sem executar créditos pagos.
- Se **QA habilitado**, uma PR só pode seguir para merge após CI + parecer Claude, correções necessárias incorporadas e nova verificação de testes. Status do revisor não pode ser inferido da mera presença do workflow; é preciso job real e comentário de revisão no PR.
- Se **QA não habilitado**, manter CI obrigatório, revisão própria e transparência sobre ausência de segundo avaliador; não bloquear indefinidamente o desenvolvimento nem fingir aprovação do Claude.
- Qualquer PR de QA deve ser revisada separadamente, não pode tocar checkout real, banco de produção, pagamentos, migrations já aplicadas, eliminar autenticação ou colocar segredos no Git.
