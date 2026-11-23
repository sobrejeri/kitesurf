# Lote de 10 atividades (#93, PR #323, issue #105): relatório de 23/11/2026

**Regra seguida:** teste automatizado e CI verde **não** são homologação. **Homologadas: 0/16.** Nada foi aplicado em nenhum Supabase, sem merge e sem deploy. O ambiente de automação não alcança `*.supabase.co` nem o app publicado (`HTTP 000`), e não há dispositivo: tudo o que exige banco real, sessão autenticada ou aparelho está marcado como bloqueado.
**Branch:** `feat/93-lote10-reconciliacao-20261123` (parte de `feat/93-interrupcao-por-aula-20261121` com a base `4448876` mesclada). **Banco descartável:** `scripts/test-db.sh` completo: PASS, exit 0 (52 linhas PASS); 62 scripts de front: 0 falhas; typecheck, lint e build: PASS.

## Status por atividade
| # | Atividade | Estado | Evidência (arquivos) | Resultado |
|---|---|---|---|---|
| 1 | Reconciliação das migrações | **FEITO** (com ressalva: ledger real não verificado) | `docs/RECONCILIACAO_MIGRACOES_93_20261123.md`, `docs/CONSULTA_RECONCILIACAO_LEDGER_20261123.sql` (R1–R7, somente leitura), 3 espelhos idempotentes `20261123114519/114813/114943`, teste `94` alinhado | achados: GRANT de `start_meeting` na #323 reabriria o P0 (erro meu, já corrigido por outra sessão); deriva `search_path=""` (banco) × `pg_catalog` (migration 44 preparada); a `20261121143000` nunca entrou no ledger com essa versão |
| 2 | Backup e rollback | **PARCIAL**: provado em descartável; **backup real BLOQUEADO** | `scripts/test-backup-rollback.sh`, `docs/rollback/20261121120000_down.sql`, `docs/BACKUP_E_ROLLBACK_20261123.md` | dump → migration → restauração em cluster novo = fingerprint e contagens idênticos; rollback SQL devolve o estado; recusa com encontro interrompido; reaplicação limpa. Falta: backup do projeto real e restauração em projeto isolado |
| 3 | Segurança das RPCs | **FEITO** | `supabase/tests/89n_rpc_security_audit.test.sql` | search_path em todo SECURITY DEFINER e função de gatilho; anon só em 4 funções decididas; `start_meeting` negada (privilégio e chamada); `start_ordered_meeting` só authenticated; `notify_*` fechadas com 1 gatilho ligado; 4 funções com search_path fixo; RLS em toda tabela; escrita direta só em `partner_payout_details`; inventário fechado de 86 RPCs; 4 mutações detectadas |
| 4 | Início ordenado | **FEITO** | `supabase/tests/89o_start_ordered_refusals.test.sql` | 22 recusas (dono, não dono, aluno, admin, PIN, status da reserva e do encontro, 24 h, anterior pendente, continuidade) todas **sem efeitos colaterais** (instantâneo igual) |
| 5 | Interrupção e retomada | **FEITO** (SQL); UI atrás de flag desligada | `supabase/tests/89p_interruption_vnt1008_scenarios.test.sql` (+ `89l`, `89m`, corrida F1–F5) | 4 h = 2×120: legado 110+115 = 225/240, saldo 15; caminho novo conclui sem saldo (reposição recusada); interrupção 110+10 e 115+5 fecham 240/240; limites (restante, minutos, retomada); repetições recusadas; não antecipação |
| 6 | Agenda e fila única | **PARCIAL** | testes existentes (`89a`, `89b`, `test-p0-booking-concurrency.sh`, `test-meeting-resume-concurrency.sh`, `92_*`, `89h`, `test-offer-offline-executor.sh`); experimento descartável com a branch Business | sem deadlock e sem dupla reserva entre `create_booking` e retomada (duas sessões). Com `feat/ventokite-business-db-phase5` mesclada **localmente** (não enviada) as 5 migrations Business aplicam e a suíte inteira passa (54 PASS), incluindo o teste dela "uma agenda entre unidades, empresas e fluxo digital". **Falta:** corrida real de duas sessões entre `create_booking` e `create_external_booking` (o código já usa a mesma trava de instrutor, mas não há teste de corrida) e A→B→C com agendador real |
| 7 | Chat e notificações | **PARCIAL** | `supabase/tests/89q_chat_notifications_delivery.test.sql` | os 4 `notify_*` **disparam** e entregam só ao destinatário certo, mesmo sem EXECUTE; localização: coordenadas inválidas/nulas recusadas sem efeito, só participantes enviam e leem (RLS), terceiros e admin recusados; avisos isolados por RLS, sem escrita direta. **Bloqueado:** entrega em canal real (push, e-mail, Realtime) e app autenticado em aparelho |
| 8 | Perfis e Business | **PARCIAL** | `supabase/tests/89r_role_matrix.test.sql` | matriz automática: 64 RPCs × 4 perfis (256 chamadas): papel errado recusado pela regra de papel antes de qualquer outra coisa; admin atravessa a porta e cai na checagem de dono; **admin nunca é autoatribuído**. Multiempresa/unidade/caixa: só no experimento descartável (suíte Business dela passa junto); **não integrada à base**; sessões reais dos 4 perfis **bloqueadas** |
| 9 | PWA e publicação | **PARCIAL** | `scripts/test-pwa-publication.mjs` (no CI) | `/api/version` ao vivo e sem cache, `version.json` sem cache, worker **sem Cache API** (nada autenticado é guardado), registro com `updateViaCache:'none'`, recarga com parâmetro novo, manifesto instalável. Segundo os comentários de 23/11 na #105 o Render está `live` em `4448876` (= topo da base), **não verificado por mim**. **Bloqueado:** atualização em iPhone/Android |
| 10 | Relatório e entrega | **FEITO** (este documento, PR draft e comentários) | este arquivo | ver matriz abaixo |

## Matriz das 16 frentes (#87–#100, #102, #103)
| Frente | Evidência técnica nova neste lote | Falta para homologar | Homologada |
|---|---|---|---|
| #87 Deploy, CI e PWA | `test-pwa-publication.mjs`; CI; Render `live` (reportado) | atualização no iPhone/Android, ensaio de rollback do app | Não |
| #88 Supabase e migrações | reconciliação, espelhos dos hotfixes, backup/restauração e rollback provados em descartável | backup do projeto real, ledger real (R1–R7), ensaio em projeto isolado | Não |
| #89 Login, perfis, documentos | matriz 64×4, admin não autoatribuído | sessões reais dos 4 perfis, upload e visibilidade de documentos | Não |
| #90 Busca, níveis, encontros | cenário 4 h/2×120, cobertura existente | E2E 2–6 h autenticado | Não |
| #91 Agenda do instrutor | corrida sem deadlock/dupla reserva; Business compatível (descartável) | corrida real digital × escola; E2E | Não |
| #92 Fila | cobertura existente (expiração, ofertas, executor offline) | A→B→C com agendador real e 3 instrutores | Não |
| #93 Aula, presença, evolução, saldo | `89o`, `89p`, `89l`, `89m`, UI do instrutor atrás de flag | E2E (VNT-1008), Etapas 3–4, flag e migration em projeto isolado | Não |
| #94 Reagendamento e cancelamento | continuidade agendada pelo instrutor (conflitos, ordem) | prazos 72 h/12 h em sessões reais | Não |
| #95 Chat | `89q`: localização e mensagens só entre participantes (RLS) | E2E duas conversas em iPhone/PC, anexos | Não |
| #96 Avisos e notificações | `89q`: os 4 gatilhos disparam e entregam certo | push/e-mail reais, scheduler, retries | Não |
| #97 Admin | matriz de papéis; tela de Relatórios em branch própria | homologação de decisões e relatórios | Não |
| #98 Pousada / afiliado | papel `partner` na matriz | QR, atribuição e comissão da 1ª compra em sessão real | Não |
| #99 Transporte | nada novo | veículos, capacidade, conflitos, cobrança | Não |
| #100 Design | nada novo | padronização e acessibilidade em aparelhos | Não |
| #102 Segurança / LGPD | auditoria `89n`, hotfixes espelhados, backup/rollback | 84 RPCs revisadas, leaked-password protection, backup real; termos/privacidade em branch própria | Não |
| #103 Homologação 4 áreas | corpo de testes em CI | E2E autenticado por perfil e dispositivo, sem P0 | Não |

**Total homologado: 0/16.**

## Riscos e pontos de atenção
1. `reject_test_payment()` (função de gatilho INVOKER) ainda é executável por anon/authenticated; chamada direta falha por ser função de gatilho, mas vale um REVOKE em migration futura (decisão do responsável).
2. A superfície de RPC é um **portão deliberado**: o teste `89n` falha para qualquer RPC nova alcançável pela API até ela entrar no inventário. Se a branch Business for integrada, ela traz 17 RPCs novas (decidir e acrescentar).
3. Saldo legado e painel de reposição do aluno seguem ativos até a Etapa 3 (#93).
4. Um teste de corrida do meu lote teve falha intermitente na primeira rodada; endureci a fixture e rodei a suíte 3 vezes seguidas sem falha.
5. Os espelhos dos 3 hotfixes foram **reconstruídos da descrição**: compare com o `statements` do ledger (R2) antes de tratá-los como idênticos.

## Próximo passo
Revisão independente do ChatGPT; depois, com autorização: backup real → projeto isolado → `scripts/rehearse-chain.sh` → E2E com sessões. Sem merge e sem deploy até lá.
