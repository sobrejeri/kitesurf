# Reconciliação de migrations (#93, lote de 10, item 1): repositório × PR #323 × hotfixes aplicados no Supabase

**Data:** 23/11/2026. **Escopo:** só leitura e documentação mais três espelhos idempotentes no repositório. **Nada foi aplicado em nenhum Supabase** e o ledger não foi tocado.
**O que eu NÃO consegui verificar:** o ledger e os grants reais. Este ambiente não alcança o Supabase; os fatos do banco abaixo vêm dos comentários de 23/11 nas issues #93/#105 (feitos por outra sessão com acesso) e precisam ser confirmados com `docs/CONSULTA_RECONCILIACAO_LEDGER_20261123.sql` (somente leitura, R1–R7).

## 1. Fontes
| Fonte | Estado |
|---|---|
| Base `claude/cool-ride-x47z5c` | `4448876` (inclui #324 hotfix start_meeting e #325 teste VNT-1008) |
| PR #323 (draft) | HEAD remoto `29dc019` (inclui o conserto do GRANT de `start_meeting`); meu merge com a base: `59bb6d1` |
| Ledger Supabase Kitesurf (segundo #93/#105) | 39–42; `20261121111421` (admin lê habilidades, #318/#319); hotfixes `20261123114519`, `20261123114813`, `20261123114943` |

## 2. Tabela de reconciliação
| Mudança | Arquivo no repositório | Versão no ledger | Situação | Ação |
|---|---|---|---|---|
| Admin lê `meeting_skill_progress` | `20261121000043_meeting_skill_progress_admin_read.sql` | `20261121111421` | **versões diferentes**, mesmo efeito (policy `meeting_skill_progress_admin_read`) | Não reaplicar. Não alterar o ledger. Documentado |
| Revoga `start_meeting` do cliente (P0) | `20261121143000_revoke_direct_start_meeting.sql` (#324) **e** espelho novo `20261123114519_…sql` | `20261123114519` | o arquivo da #324 **nunca foi registrado** com a versão dele; o efeito entrou como `114519` | Espelho adicionado (idempotente). Não rodar no projeto atual |
| Revoga `notify_*` (4 funções de trigger) | **não existia**; espelho novo `20261123114813_…sql` | `20261123114813` | aplicado só no banco | Espelho adicionado; gatilhos seguem disparando |
| `search_path` fixo em 4 triggers | `20261110000044_fix_trigger_search_path.sql` (preparada, `pg_catalog`) + espelho novo `20261123114943_…sql` (`""`) | `20261123114943` | **deriva**: o banco ficou com `search_path=""`; a 44 e o teste `94` esperavam `pg_catalog` | Teste `94` agora aceita os dois valores **fixos** (recusa a volta ao mutável). A 44 fica **superada na prática**: não aplicar |
| Interrupção/retomada (PR #323) | `20261121120000_meeting_interruption_resume.sql` | — | **não aplicada** (confirmar por R5) | Só em projeto isolado; ver §4 |

## 3. Riscos de ordem e conflitos encontrados
1. **`start_meeting` e a PR #323 (corrigido).** Meu commit original da `20261121120000` fazia `GRANT EXECUTE … start_meeting TO authenticated`, o que **reabriria o P0** tratado pela #324. Outra sessão corrigiu em `cb79a16` (agora `REVOKE … FROM authenticated`) e há teste de regressão (`89m_*`). Fica registrado que o erro foi meu.
2. **Ordem de versões.** `20261121120000` (#323) roda **antes** de `20261121143000` (#324): o REVOKE final prevalece nos dois caminhos. No banco real, o efeito já existe desde `114519`.
3. **`start_ordered_meeting` tem três versões** (hashes normalizados em R6 do SQL de consulta): dia do calendário (`f2cee766…`), 24 h (`e4d2388f…`) e a da #323 (`0a43a8db…`). A **24 h não consta** como aplicada nos comentários de 23/11 ("regra de dia local"); R6 decide. Aplicar a `20261121120000` sobre a versão do dia do calendário **troca a regra de início de uma vez** com o corpo novo (24 h) **somente se** `20261120120000` for aplicada antes: a cadeia correta é a da tabela de ordem em `docs/HOMOLOGACAO_MIGRACOES_88.md`, linhas 1–11, e a 12ª é a da #323.
4. **Teste `94`** deixava de refletir o banco real (acima, resolvido).
5. **`db push` continua proibido** no projeto existente: o ledger tem versões que o diretório local não tinha (e o contrário), e o histórico 01–38 foi aplicado à mão.

## 4. Plano de reconciliação (sem tocar no ledger)
1. Rodar `docs/CONSULTA_RECONCILIACAO_LEDGER_20261123.sql` e anexar a saída (R1 a R7). Resultados esperados estão escritos em cada bloco.
2. Se R2 mostrar **texto diferente** do espelho, trocar o espelho pelo texto do ledger (é só documentação no repositório) antes de qualquer outra coisa.
3. Se R6 mostrar `f2cee766…`: a regra de 24 h ainda não está em produção → aplicar `20261120120000` **antes** da `20261121120000`.
4. Backup verificável (item 2) → projeto isolado restaurado do dump (variante B, sem `db push`) → `scripts/rehearse-chain.sh` (agora inclui os três espelhos, idempotentes, e a #323) → só então decidir produção.
5. Nunca registrar manualmente no ledger. Quando as migrations forem aplicadas por SQL, o ledger passa a ter as versões reais; o repositório mantém os arquivos com a mesma versão (os três espelhos já seguem esse nome).
6. A `20261110000044` e a `20261121143000` ficam no repositório como histórico (nunca aplicadas com essas versões); **não aplicar**.

## 5. Verificação feita (descartável, não é produção)
`scripts/test-db.sh` completo com os três espelhos e o merge da #323 + base: **PASS (exit 0)**, 46 linhas PASS. Prova que as migrations são idempotentes na cadeia e que os gatilhos continuam funcionando com `search_path=""` e com os `notify_*` sem EXECUTE.
