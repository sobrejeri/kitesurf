# Confirmação simulada exige instrutor

Uma reserva própria em `awaiting_payment`, dentro de dez minutos, podia ser confirmada por `confirm_test_payment` com `instructor_id=NULL`. Os dois NULL também passam no teste `IS DISTINCT FROM` da versão do repositório. A confirmação de validação já recusava esse estado.

O defeito foi reproduzido em PostgreSQL 17 descartável nas duas versões conhecidas. A regressão falhou antes com `test payment must reject a booking without an instructor`. A leitura do projeto `qadkqjfmmnxvovyyhqxw` em 27/11/2026 consultou apenas definições e metadados de funções, sem linhas de usuários ou reservas.

A migration `20261127021747_reject_test_payment_without_instructor.sql` foi criada com `supabase migration new` da CLI 2.122.1. Ela insere uma recusa `55000` (`Booking has no instructor`) após a checagem de titularidade e antes de confirmar o estado. Não altera preços, snapshots, auditorias existentes, provedores de pagamento, grants, outras funções ou a ordem de locks de cada baseline. Não houve aplicação remota.

| Baseline | MD5 do corpo antes | MD5 depois |
|---|---|---|
| Observado, perfil → reserva | `b14c82bf96cd041fb2d00fd5a8a1f3f3` | `7ec941f10a25a01701aa14cb0d89b8a1` |
| Repositório, instrutor → perfil → reserva | `8612883273a948c7bbe54ac9f7851ccb` | `b46dc7bf48c3c82b4ec5bc39a86067ec` |

O corpo remoto não contém a melhoria de locks do repositório. Esta correção não a promove implicitamente: a conciliação dessa diferença continua separada. A migration reconhece apenas esses hashes, exige metadados e ACL conhecidos e faz uma substituição exata do ponto de inserção. O postflight compara todo `pg_proc` exceto `prosrc`: OID, dono, ACL, argumentos, defaults, flags e `search_path` precisam permanecer idênticos. Nenhum novo endpoint é criado.

`supabase/reconciliation/89_test_payment_instructor_guard.remote-readonly.sql` permite conferir o estado sem executar a função. Antes de qualquer aplicação autorizada, capturar a declaração atual com `pg_get_functiondef`, seus metadados e o snapshot operacional. Um rollback autorizado usa essa declaração capturada com `CREATE OR REPLACE`, seguido da comparação dos metadados. A versão do ledger é tratada pelo procedimento de implantação; o roteiro não a altera.

## Verificação

- `89o_test_payment_instructor_required.test.sql`: outro aluno recebe `P0002`; NULL recebe `55000` sem mudar reserva, encontros, auditoria ou fila; instrutor válido confirma uma vez; repetição é recusada sem nova auditoria ou movimento na fila. Fixtures são revertidas.
- `scripts/test-test-payment-instructor-migration.sh`: aplica em replay e no corpo observado com grant `service_role`; compara metadados e dados; rejeita alterações de corpo, ACL, search_path e default, sem modificar o estado adulterado. Cluster local novo, TCP loopback, sem DSN remoto.
- O teste SQL entra no loop existente de `scripts/test-db.sh`; o ensaio das duas baselines também é chamado ao final da suíte.

Nenhuma dessas provas é pagamento real, homologação de checkout ou autorização para DDL remoto.
