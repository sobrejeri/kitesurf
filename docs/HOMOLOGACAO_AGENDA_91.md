# Módulo 2 — Agenda e disponibilidade (#91): entrega e roteiro de homologação independente

**Estado:** código e testes em banco descartável concluídos; **nada aplicado no Supabase real**; E2E autenticado **pendente**. 0/16 frentes homologadas.

## O que o módulo faz agora
| Tema | Comportamento |
|---|---|
| Turnos | Horário **diferente por dia da semana** (antes: o mesmo para todos), até 3 **pausas** por dia (almoço), intervalo entre aulas (0–120 min) |
| Folga, férias, bloqueio | Três tipos: bloqueio (horas/dias, até 30 dias), folga (dias inteiros, até 14), férias (dias inteiros, até 180). Recusa se houver aula confirmada **ou reserva em pagamento** no período |
| Horário extra | Janela numa data fora do turno (ex.: sábado de vento forte). Folga/férias continuam valendo |
| Agenda | Dia, semana e mês (`/instrutor/agenda?visao=&dia=`): aulas, turno/pausa do dia, folgas e férias, horário extra |
| Regra única | `instructor_slot_open` é usada por `instructor_can_attend` (busca/reserva/fila) **e** por `can_move_meeting` (reagendamento). Antes as duas repetiam a regra |
| Segurança transacional | Toda escrita de agenda trava a linha do instrutor (a mesma que `create_booking` trava com `FOR UPDATE SKIP LOCKED`) |
| Barreira no banco | Dois encontros ativos do mesmo instrutor não se sobrepõem, mesmo por inserção direta, remarcação ou troca de instrutor (advisory lock por instrutor) |
| Fila | Ao salvar turnos/bloquear, ofertas abertas que deixaram de caber voltam à fila (`SKIP LOCKED`, com auditoria `offer.withdrawn_availability`) |
| Aulas confirmadas | **Nunca apagadas nem movidas**: se ficarem fora do novo turno são listadas (`list_my_schedule_conflicts`) e o instrutor combina o reagendamento pela aula |
| Permissões | Só instrutor chama; anon sem EXECUTE; auxiliares fechadas à API; um instrutor não remove nem vê bloqueios de outro (RLS) |

## Migration necessária (uma, aditiva)
`supabase/migrations/20261125100000_instructor_schedule_v2.sql`. Cria `instructor_weekly_breaks`, `instructor_extra_hours`, coluna `instructor_time_off.kind` e 10 funções/2 gatilhos; **substitui** 5 funções (mesma assinatura): `instructor_can_attend`, `can_move_meeting`, `save_my_schedule`, `block_my_time`, `unblock_my_time`. **Não edita migration aplicada. Não aplicar no remoto antes da revisão.** Não toca `create_booking`, preços, pagamentos, 39–42 nem Protege 3B. Compatível com a cadeia #90 (`20261124080301`).

Antes de aplicar: `docs/CONSULTA_DERIVA_AGENDA_91.sql` (somente leitura) deve dar `igual = true` nas 5 funções, 0 objetos novos e 5 tabelas de dependência. Rollback: `scripts/ops/91-capture-rollback.sql` (gerar **antes** de aplicar; ensaio em `scripts/test-91-rollback.sh`). O rollback tem **preflight embutido** (mesmo banco e mesma impressão digital das praias; migration realmente aplicada; senão aborta sem mudar nada), devolve as 5 funções (corpo, definer, search_path, dono, ACL, inclusive `WITH GRANT OPTION`; se o grantor divergir a conferência final aborta), remove gatilhos e funções novos com `DROP` sem `IF EXISTS` e **preserva** as tabelas aditivas e os dados. **Não toca o ledger**: registrar ou remover a versão é decisão manual de quem aplicou. A migration é reaplicável por cima das tabelas preservadas. Depois do rollback a **UI nova deixa de funcionar** (chama RPCs removidas): reverta o app junto. O nome do arquivo `20261125100000_…` é candidato: a versão no ledger é a que a CLI/aplicação atribuir, não presumir.

Ordem sugerida no remoto (só depois da revisão, com backup lógico restaurado e o procedimento de `ops/90-backup-restore-rollback`): (1) capturar o rollback, (2) clone restaurado: aplicar a migration, rodar `91a`, `91b` e a concorrência, (3) remoto em transação única (`-1`), (4) `91a` equivalentes manuais e conferência da interface.

## Evidências (PostgreSQL 16 descartável)
- `scripts/test-db.sh` completo, incluindo `supabase/tests/91a_schedule_v2.test.sql`, `91b_schedule_queue_integration.test.sql`, `scripts/test-schedule-concurrency.sh` e `scripts/test-91-rollback.sh`.
- Concorrência real de duas conexões: (A) reserva em curso × bloqueio, o bloqueio **espera** a reserva e é recusado; (B) bloqueio em curso × reserva → `NO_INSTRUCTOR`, nada criado; (C) redução de turno em curso × reserva fora do novo turno → recusada. Sem deadlock. **Mutação:** removendo o lock da linha do instrutor de `add_my_time_off`, o cenário A falha.
- `scripts/test-instructor-agenda.mjs` (regras puras: formulário de turnos, grade de dia/semana/mês, fuso de Fortaleza, folga/férias) e guardas estáticas das Server Actions; no CI.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` e os 60 scripts `node` do CI.
- Capturas em celular (390 px) e PC (1280 px) com backend **fictício** local: sem rolagem horizontal.

## Roteiro de homologação independente (E2E autenticado, com a migration aplicada em ambiente isolado)
1. **Instrutor** → *Dias e turnos*: marcar seg 08–18 com pausa 12–13 e ter 14–20; salvar. Conferir o resumo por dia.
2. **Aluno**: buscar aula na praia do instrutor em seg 12:00 (deve falhar: "Nenhum instrutor disponível"), seg 13:00 (ok) e ter 10:00 (falha). Reserva de 2 h e de 4 h em 2 dias dentro dos turnos: criada, total = horas × taxa vigente.
3. **Instrutor** → *Agenda*: ver a aula nas visões Dia/Semana/Mês; registrar folga de 2 dias e férias; tentar bloquear sobre aula confirmada (recusa com mensagem clara).
4. **Concorrência**: duas abas, aluno reservando e instrutor bloqueando o mesmo horário; só um vence.
5. **Fila**: solicitação com oferta aberta; instrutor fecha aquele dia; a oferta passa para o próximo instrutor e o aluno não perde a solicitação.
6. **Reagendamento**: aluno/instrutor pede mover uma aula para dentro de uma pausa ou férias: recusado; para um horário livre: aceito.
7. Celular e PC (e PWA instalado): sem rolagem horizontal, botões ≥ 44 px, datas e horários no fuso de Fortaleza.

## Limitações conhecidas
- Sem sessão autenticada real, sem Supabase isolado e sem iPhone/Android neste ambiente: o E2E e a conferência em aparelho **não foram feitos**. As capturas usam um backend fictício.
- A barreira do banco compara encontros pelo horário exato (sem o intervalo entre aulas); o intervalo continua sendo regra de `instructor_can_attend`/`can_move_meeting`.
- Sobreposições **históricas** já existentes não são alteradas (a consulta de deriva conta quantas há).
- Remarcação pelo aluno depende de `can_move_meeting`, agora com as pausas, férias e horários extras.
- Admin continua só lendo a agenda (`/admin/agenda`); não há edição administrativa da agenda do instrutor neste módulo.

## Revisão do ChatGPT em 25/11 (comentário 7164745589): o que mudou
1. **CI falhou no HEAD `185ae35`** (`bc: command not found` no runner): o "ALL TESTS PASSED" anterior era **local**, não do CI. Reescrevi `scripts/test-schedule-concurrency.sh` sem `bc` e sem depender de tempo: cada cenário sincroniza por **estado observado** (`pg_stat_activity`: a sessão 1 em `PgSleep`; a sessão 2 em `Lock` quando deve esperar), e há teste de mutação (`scripts/test-schedule-concurrency-mutation.sh`) que exige falha **pelo motivo certo** sem o lock.
2. **`add_my_time_off`**: `p_kind` NULL dá 22023; folga e férias exigem meia-noite local nas duas pontas **no SQL** (1 h, início ou fim parcial são recusados).
3. **`add_my_extra_hours`** agora reconcilia sempre (inclusive ao reduzir uma janela) e devolve o impacto; a UI mostra o aviso.
4. **Reserva em pagamento × agenda alterada** — **POLÍTICA A CONFIRMAR**: a reconciliação **cancela** a retenção (10 min, nada pago) que deixou de caber e a audita (`booking.hold_cancelled_availability`); assim `confirm_test_payment` e `confirm_validation_lesson` a recusam (55000). Reserva **confirmada** nunca é tocada, só listada. Testes: `91a` (H, I) e concorrência D/E (confirmação espera e é recusada, sem deadlock). **Não construí** uma corrida de duas conexões para `respond_meeting_change` × edição de agenda: o reagendamento usa a mesma regra (`can_move_meeting`, testada em `91a` I), mas a corrida real fica pendente.
5. **Rollback**: preflight, sem ledger, sem `IF EXISTS`, `GRANT OPTION`, reaplicação por tabelas preservadas (itens acima).
Pré-flight somente leitura do ChatGPT no Kitesurf (5/5 funções iguais, 0 objetos novos) continua valendo; **não** autoriza aplicar.
