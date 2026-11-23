# Backup verificável e rollback (lote de 10, item 2)

**Regra do lote:** sem backup recuperável comprovado, **não** se aplica migration de risco nem se faz merge/deploy sensível. Este documento separa o que já está **provado em banco descartável** do que **só o responsável consegue provar** no Supabase real.

## 1. Provado automaticamente (`scripts/test-backup-rollback.sh`, dentro de `scripts/test-db.sh`)
Em PostgreSQL descartável (nunca em Supabase), com a migration da PR #323 (`20261121120000`) como alvo:
1. Banco anterior à migration + fixture → **fingerprint F0** (tabelas e contagens, colunas, restrições, funções, ACLs de função e de tabela, políticas RLS, gatilhos, RLS ligada, buckets) e **backup** `pg_dump -Fc`; o backup é legível por `pg_restore -l`.
2. Aplica a migration: o fingerprint **muda** (o teste enxerga a mudança) e nenhum dado muda.
3. **Restauração em cluster novo** do backup anterior: fingerprint **idêntico a F0** e contagens iguais; as colunas novas não existem.
4. **Reversão por SQL** (`docs/rollback/20261121120000_down.sql`, gerado a partir do estado anterior; o teste falha se ficar desatualizado): devolve fingerprint e dados a F0. **Recusa** (sem efeito) se existir encontro interrompido, para não perder motivo, minutos e estado.
5. A migration pode ser **reaplicada** depois do rollback e reproduz exatamente o estado migrado.

Resultado da última execução: contagens (reservas/encontros/auditoria/perfis/habilidades/avisos) `4/5/16/6/0/2` antes, migrado, restaurado e após o rollback. Limitação honesta: a comparação de restrições ignora parênteses e espaços, porque o `pg_restore` reescreve CHECKs encadeados sem mudar o significado.

## 2. O que SÓ o responsável prova (Supabase real)
O ambiente de automação não alcança `*.supabase.co`, então **não há evidência de backup do projeto real**. Para liberar qualquer migration:
1. **Gerar o backup** (um dos dois, e anotar data/hora e tamanho):
   - painel Supabase › Database › Backups (backup diário ou PITR, conforme o plano), **ou**
   - `pg_dump` manual com a connection string do projeto Kitesurf, em um terminal do responsável:
     ```bash
     pg_dump "$KITESURF_DB_URL" --format=custom --no-owner --no-privileges -f vento-backup-AAAAMMDD.dump
     pg_restore -l vento-backup-AAAAMMDD.dump | head   # precisa listar as tabelas sem erro
     ```
2. **Restaurar em projeto isolado** (variante B de `docs/HOMOLOGACAO_PROJETO_ISOLADO.md`, sem `db push`) e rodar as consultas somente leitura (`docs/CONSULTAS_HOMOLOGACAO_SOMENTE_LEITURA.sql`, Q1–Q11 e `docs/CONSULTA_RECONCILIACAO_LEDGER_20261123.sql`, R1–R7): contagens por tabela e fingerprint de funções/ACLs iguais ao projeto de origem.
3. **Registrar a evidência** na #105: data do backup, método, hash/tamanho do arquivo, projeto onde foi restaurado, saída das contagens. **Só então** `scripts/rehearse-chain.sh` no isolado.

## 3. Plano de rollback por migration
| Migration | Reversível? | Como | Cuidado |
|---|---|---|---|
| `20261121120000` interrupção/retomada (PR #323) | **sim, enquanto não houver encontro interrompido** | `psql -1 -f docs/rollback/20261121120000_down.sql` (provado) | Com a flag desligada nenhum encontro é interrompido; depois de ligada, a reversão só com os encontros interrompidos concluídos ou exportados. Alternativa sem perda: **desligar a flag** (`NEXT_PUBLIC_VENTO_INTERRUPTION_FLOW_ENABLED=false`) e manter o schema |
| `20261120120000` janela de 24 h | sim, por `CREATE OR REPLACE` com o corpo anterior | restaurar o corpo de `start_ordered_meeting` da migration 26 | muda a regra de início para o dia do calendário |
| `20261120100000` / `20261120110000` ordem de locks no pagamento | sim, por `CREATE OR REPLACE` com os corpos anteriores | corpos da migration 10 e 09 | só reintroduz o risco de deadlock (P2-1) |
| `20261119140000` job de expiração (não agenda nada) | sim | `DROP FUNCTION run_expiry_jobs(), run_queue_expiry_job(integer)` | se um agendador já os chama, remova o agendamento antes (`cron.unschedule`) |
| `20261119120000`, `20261119130000` | sim, por `CREATE OR REPLACE` com os corpos anteriores | corpos históricos identificáveis pelo D7 | — |
| `20261117190000` guarda do aluno | sim | `DROP TRIGGER …; DROP FUNCTION …` (2 gatilhos e 2 funções) | volta a permitir encontros simultâneos do aluno |
| `20261116160000` / `20261116170000` `create_booking` | **por restauração** | reaplicar o corpo anterior da assinatura de 6 args e da legada de 5 args | não há "undo" curto; preferir restaurar do backup |
| Hotfixes de 23/11 (`114519` start_meeting, `114813` notify_*, `114943` search_path) | tecnicamente sim, **mas não recomendado** | `GRANT EXECUTE …` / `ALTER FUNCTION … RESET search_path` | reabrem os achados de segurança P0/advisor; só com decisão explícita |
| Qualquer migration com dados novos (colunas preenchidas) | **por restauração do backup** | `pg_restore` no projeto isolado e comparar; no real, só com janela e aprovação | perda dos dados gravados depois do backup |

**Ordem de reversão:** sempre inversa da aplicação; **parar** na primeira falha e copiar a mensagem exata; nunca editar migration aplicada nem o ledger à mão.
