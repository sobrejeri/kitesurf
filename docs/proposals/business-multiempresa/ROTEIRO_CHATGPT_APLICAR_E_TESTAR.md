# Roteiro para o ChatGPT: aplicar e testar a migration da fase 1 (projeto de TESTE)

Quem executa isto precisa de acesso ao editor SQL de um **projeto Supabase de teste**, dado pelo responsável. O ChatGPT não acessa o Supabase sozinho: o responsável cola os comandos e devolve as saídas, ou o ChatGPT guia passo a passo.

**Regra principal:** aplicar primeiro num projeto de **teste**. Produção só depois que o relatório voltar limpo e o responsável autorizar por escrito.

## Prompt para colar no ChatGPT

> Você vai me ajudar a aplicar e testar uma migration SQL num projeto Supabase de TESTE (não produção) e devolver um relatório fiel. Regras:
> 1. Não altere o SQL. Se der erro, copie a mensagem exata e pare; não tente "consertar" editando a migration.
> 2. Não rode `REVERSAO_fase1.sql` nem `PROPOSTA_fase1.test.sql` no Supabase. O primeiro apaga tabelas; o segundo cria usuários de teste e só pode rodar em banco descartável.
> 3. Não me peça chaves, senhas nem a `service_role`. Eu colo o SQL no editor SQL do próprio painel.
> 4. Execute os passos na ordem, um de cada vez, e me diga exatamente o que colar e o que esperar. Compare cada saída com o "ESPERADO" do arquivo e marque OK ou FALHOU.
> 5. No final, monte o relatório no modelo abaixo, sem inventar nada: o que não foi executado fica como "não executado".
>
> Passos:
> A. Antes: confirmar que é o projeto de teste. Rodar a consulta "snapshot antes" e guardar o resultado.
> B. Conferir dois pré-requisitos do projeto (e-mail confirmado e migrations 47 e 48).
> C. Aplicar `supabase/migrations/20261115120000_business_company_core.sql` inteira, de uma vez.
> D. Rodar `docs/proposals/business-multiempresa/VERIFICACAO_somente_leitura.sql`, bloco a bloco, comparando com o ESPERADO.
> E. Rodar de novo a consulta "snapshot" e comparar com o antes: as únicas diferenças devem ser objetos novos de empresa.
> F. Montar o relatório.

## Os arquivos (no repositório `sobrejeri/kitesurf`, branch `feat/ventokite-business-db-phase1`, PR #275)

- Migration: `supabase/migrations/20261115120000_business_company_core.sql`
- Verificação (somente leitura): `docs/proposals/business-multiempresa/VERIFICACAO_somente_leitura.sql`

## A. Snapshot antes e depois (somente leitura)

```sql
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r') as tabelas_public,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') as funcoes_public,
  (select count(*) from pg_policies where schemaname = 'public') as politicas_public,
  (select count(*) from public.profiles) as perfis,
  (select count(*) from public.bookings) as reservas;
```

Depois da migration: `perfis` e `reservas` **iguais ao antes**; `tabelas_public` sobe em 13, `funcoes_public` em 19 e `politicas_public` em 13. Qualquer outra diferença é um problema: pare e relate.

## B. Pré-requisitos do projeto

1. **E-mail confirmado:** no painel, Authentication → Providers → Email, ver se "Confirm email" está **ligado**. Anotar ligado ou desligado. (A migration aceita convites comparando o e-mail da conta; sem confirmação isso não é seguro. Se estiver desligado, **não prossiga para produção**.)
2. **Migrations 47 e 48 presentes** (CPF/CNPJ e segundo fator do admin). ESPERADO: 3 linhas.
   ```sql
   select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and proname in ('tax_id_is_valid', 'session_has_second_factor', 'is_admin');
   ```
   A migration usa `tax_id_is_valid`, `reject_change`, `write_audit`, `is_admin` e `require_role`; se faltar algum, o SQL falha com "function does not exist". Relate e pare.
3. **`pg_cron`** (informativo): Database → Extensions, anotar se `pg_cron` está ativado.

## C. Aplicar a migration

Colar o conteúdo inteiro do arquivo da migration no editor SQL e executar uma vez. O arquivo já tem `begin;`/`commit;`: se der erro, nada é gravado. ESPERADO: "Success. No rows returned". Se aparecer erro, copiar a mensagem completa e a linha e parar.

## D. Verificação

Rodar `VERIFICACAO_somente_leitura.sql` bloco a bloco. No bloco [11], o primeiro comando **deve falhar** com `permission denied for function create_company`: isso é o resultado esperado (a tabela fica sem linhas e nada é gravado). Resumo do esperado:

| Bloco | Esperado |
|---|---|
| 1 | 13 tabelas, todas `rls = true` |
| 2 | 0 linhas (cliente sem escrita direta) |
| 3 | 0 linhas (anon sem leitura) |
| 4 | 19 funções, todas `definer = true` e `search_path_fixo = true` |
| 5 | 0 linhas (anon não executa) |
| 6 | 2 linhas, `executa_authenticated = false` |
| 7 | 2 gatilhos |
| 8 | 12 permissões e 19 ligações |
| 9 | manager, finance, attendant (sem owner nem admin) |
| 10 | 0 e 0 |
| 11 | erro de permissão no primeiro; `0` no segundo |

Estes valores foram conferidos antes, aplicando todas as migrations do repositório num PostgreSQL descartável. No Supabase real podem existir objetos extras do próprio Supabase, mas as contagens acima filtram só os objetos desta migration.

## Se algo falhar

Não editar o SQL e não rodar a reversão sem ordem. Relatar a mensagem exata. A reversão (`REVERSAO_fase1.sql`) só serve num projeto **sem dados reais**; quem decide usar é o responsável.

## Modelo de relatório (o ChatGPT devolve preenchido)

```
RELATÓRIO: migration 20261115120000_business_company_core
Projeto: TESTE (confirmado pelo responsável: sim/não)
Data e hora:

A. Snapshot antes:    tabelas_public= funcoes_public= politicas_public= perfis= reservas=
B1. E-mail confirmado: ligado / desligado
B2. Funções das migrations 47 e 48: presentes (3 linhas) / faltando: ...
B3. pg_cron: ativado / não ativado
C. Aplicação: sucesso / erro (mensagem exata e linha):
D. Verificação (marque OK ou FALHOU e cole a saída dos que falharam):
   1: ...  2: ...  3: ...  4: ...  5: ...  6: ...  7: ...  8: ...  9: ...  10: ...  11: ...
E. Snapshot depois:   tabelas_public= funcoes_public= politicas_public= perfis= reservas=
   Diferenças além das esperadas (+13 / +19 / +13): nenhuma / ...
Não executado: (liste)
Conclusão: pronto para revisão / há problemas (liste)
```

Devolva este relatório a quem continua o desenvolvimento. Ele não deve conter chaves, senhas nem dados pessoais de clientes.


---

# Fase 2 (só depois da fase 1 aplicada e validada)

Migration: `supabase/migrations/20261115130000_business_services_bookings.sql` (PR da fase 2). Verificação: `docs/proposals/business-multiempresa/VERIFICACAO_fase2_somente_leitura.sql`. Mesma regra: projeto de **teste** primeiro.

**Atenção, esta fase muda uma função do fluxo digital:** `public.instructor_can_attend` passa a considerar também as reservas presenciais confirmadas (um bloco a mais; o resto é idêntico). Por isso o passo de snapshot abaixo e o bloco [6] e [7] da verificação importam.

1. **Snapshot antes** (a mesma consulta da seção A) e, além dela, guarde o hash da função:
   ```sql
   select md5(pg_get_functiondef('public.instructor_can_attend(uuid,jsonb)'::regprocedure)) as hash_funcao_antes;
   ```
2. Aplicar a migration inteira, de uma vez. ESPERADO: "Success. No rows returned".
3. **Snapshot depois:** `perfis` e `reservas` **iguais**; `tabelas_public` +6; `funcoes_public` +15; `politicas_public` +6. O hash da função **muda** (esperado, é a única mudança no fluxo digital).
4. Rodar `VERIFICACAO_fase2_somente_leitura.sql` bloco a bloco. Esperado: [1] 6 tabelas com RLS; [2] 0 linhas; [3] 15 linhas (14 definer + `company_bookings_frozen`); [4] 0; [5] 4 linhas, todas `false`; [6] definer `t`, volatilidade `s`, `exec_authenticated = f`, `exec_anon = f`; [7] `true`; [8] 3 gatilhos; [9] 3 restrições; [10] 0, 0, 0; [11] erro de permissão no primeiro e `0` no segundo.
5. Relatório: o mesmo modelo da fase 1, com os campos extras `hash_funcao_antes`, `hash_funcao_depois` e o resultado do bloco [6] e [7].

Se a verificação falhar no [6] (a função perdeu `security definer`, ficou `volatile` ou ganhou EXECUTE para usuários), é grave: **não prossiga**, relate. A reversão `REVERSAO_fase2.sql` restaura a função original e só serve sem dados reais.


---

# Fase 3 (só depois das fases 1 e 2 aplicadas e validadas)

Migration: `supabase/migrations/20261115140000_business_stock_rentals.sql`. Verificação: `VERIFICACAO_fase3_somente_leitura.sql`. Projeto de **teste** primeiro. Esta fase **não altera** nenhuma função existente (diferente da fase 2).

1. **Snapshot antes** (consulta da seção A). 2. Aplicar a migration inteira de uma vez (esperado: "Success. No rows returned").
3. **Snapshot depois:** `perfis` e `reservas` **iguais**; `tabelas_public` +7; `funcoes_public` +14; `politicas_public` +7.
4. Rodar `VERIFICACAO_fase3_somente_leitura.sql` bloco a bloco. Esperado: [1] 7 tabelas com RLS; [2] 0 linhas; [3] 14 linhas (12 `definer`, 2 `false`); [4] 0; [5] 1 linha `false`; [6] 5 gatilhos; [7] 5 linhas; [8] `stock.adjust` sensível `true` com 1 cargo, `stock.edit` com 2, `stock.view` com 3; [9] 0 em tudo; [10] erro de permissão no primeiro e `0` no segundo.
5. Relatório no mesmo modelo, marcando cada bloco.


---

# Fase 4 (só depois das fases 1, 2 e 3 aplicadas e validadas)

Migration: `supabase/migrations/20261115150000_business_cash.sql`. Verificação: `VERIFICACAO_fase4_somente_leitura.sql`. Projeto de **teste** primeiro. Não altera função existente; **cria um bucket privado** (`vento-business-closings`) e duas políticas de Storage.

1. **Snapshot antes** (seção A) e, além dele, guarde: `select count(*) from storage.buckets;` e `select count(*) from pg_policies where schemaname = 'storage';`.
2. Aplicar a migration inteira de uma vez (esperado: "Success. No rows returned").
3. **Snapshot depois:** `perfis` e `reservas` **iguais**; `tabelas_public` +4; `funcoes_public` +14; `politicas_public` +4; buckets +1; políticas do Storage +2.
4. Rodar `VERIFICACAO_fase4_somente_leitura.sql` bloco a bloco. Esperado: [1] 4 tabelas com RLS; [2] 0; [3] 14 linhas (13 `definer`, 1 `false`); [4] 0; [5] 2 linhas `false`; [6] bucket `public = false`, limite 5242880, pdf e xlsx; [7] 2 políticas (SELECT e INSERT) só para `authenticated`, nenhuma de UPDATE ou DELETE; [8] 5 gatilhos; [9] 7 linhas; [10] 0, 0, 0; [11] erro de permissão no primeiro e `0` no segundo.
5. Relatório no mesmo modelo. Se o [6] mostrar `public = true`, **pare**: os arquivos de fechamento ficariam públicos.
