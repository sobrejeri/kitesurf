# Estrutura consolidada por módulo (25/11/2026)

Branch guarda-chuva `feat/estrutura-modulos-20261125` (PR #340, **rascunho, não mesclar**) contra a principal `c94f219`: **60 arquivos**, merge limpo (`git merge-tree` sem conflito) e `scripts/test-db.sh` completo verde **localmente** com tudo junto. Cada módulo abaixo vai em PR própria.

| Mód. | O quê | Arquivos | Migration (não aplicada) | PR de entrega |
|---|---|---|---|---|
| **A** | #91 Agenda e disponibilidade | 18 | `20261125100000_instructor_schedule_v2.sql` | **#339** (`feat/91-agenda-disponibilidade-20261124`) |
| **B** | #93 Interrupção/retomada de aula, etapas 1 a 3, atrás da flag `NEXT_PUBLIC_VENTO_INTERRUPTION_FLOW_ENABLED` (desligada) | 26 (6 são capturas PNG) | `20261121120000_meeting_interruption_resume.sql` | **#344** (`feat/93-interrupcao-aula-v2-20261125`, sobre a #323 atual `232f695`) |
| **C** | E2E autenticado (cenário prioritário) + varredura de telas | 8 | nenhuma | **#341** (`test/e2e-runner-20261125`, só a principal) |
| **D** | Alvos de toque ≥ 44 px (UI) | 6 | nenhuma | **#345** (`fix/ui-alvos-de-toque-20261125`) |
| **E** | #92 solicitação some com um instrutor só (poller + regressões + investigação) | 9 | nenhuma | **#342** (`fix/92-solicitacao-um-instrutor-20261125`) |
| **F** | Cancelamento de reserva aguardando pagamento (auditoria/trava/testes) | 3 | `20261125130000_audit_hold_cancellation.sql` | **#343** (`test/hold-cancel-audit-20261125`) |
| **S** | Arquivos compartilhados | 4 | — | tocados por A, B, C e E (ver abaixo) |

> Esta branch guarda-chuva (#340) é anterior à separação: **a fonte de verdade de cada módulo é a sua PR**. Divergências conhecidas: B foi refeita sobre a #323 atual (`232f695`, que traz correções a mais) e ganhou um ajuste no teste de concorrência da retomada; E, F e a corrida F/G da #339 não estão aqui.

## Dependências
- **A e B não dependem uma da outra para compilar nem para rodar seus testes.** Há uma dependência **semântica**: B (`schedule_meeting_resume`) chama `can_move_meeting`, que A substitui por uma versão com pausas, férias e horário extra (mesma assinatura). Qualquer ordem de merge é válida; a suíte combinada passou.
- **C não depende de A nem de B** (só do app e de contas fictícias). O cenário S2 do runner (agenda v2) é a única parte que depende de A e **fica de fora** da PR independente.
- **D** é independente; `agenda-calendar.tsx` (A) já nasce com alvos ≥ 44 px.
- Ordem de migrations se A e B forem aplicadas: `20261121120000` (B) antes de `20261125100000` (A). Nenhuma toca `create_booking`, preço ou pagamento. A conciliação com o banco real (hashes das funções substituídas) é por consulta somente leitura própria de cada módulo.

## Arquivos compartilhados e conflitos esperados entre as PRs
| Arquivo | Tocado por | Conflito esperado |
|---|---|---|
| `.github/workflows/verify.yml` | A, B, C, E (cada um acrescenta passos `node`) | **textual** (linhas vizinhas); resolver mantendo todos os passos |
| `scripts/test-db.sh` | A (4 linhas), B (1 linha), E (1 linha) | **textual** (linhas vizinhas); manter ambas |
| `src/app/actions/errors.ts` | A (mensagens de agenda, dica `INSTRUCTOR_MEETING_CONFLICT`), B (mensagens de interrupção) | **textual** (inserções na mesma lista `KNOWN`) |
| `src/lib/data.ts` | só B | nenhum entre PRs |
| `.env.example`, `scripts/rehearse-chain.sh` | só B | nenhum |
| `supabase/tests/99zzzzzzzzzzzzzz_create_booking_overloads.test.sql` | só A | nenhum |

Regra para integrar: **C → A (#339) → B**, ou B antes de A; em cada merge, rodar `scripts/test-db.sh` completo no HEAD resultante. Não integrar as PRs por esta branch.

## Itens para o revisor
- B inclui o ajuste de `scripts/test-meeting-resume-concurrency.sh` (a continuidade era escolhida dentro de 24 h, o que dependia da hora em que o teste rodava).
- B só lê as colunas de interrupção com a flag ligada e cai na leitura de sempre se o banco não as tiver; com a flag desligada nada muda para aluno e instrutor.
- Nada aqui aplica migration, ativa checkout, abre o Protege 3B ou altera dados reais.
