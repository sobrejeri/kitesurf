# #88: histórico de migrações e roteiro de aplicação (PR #300)

**Estado desta entrega:** o histórico de um Supabase real **não foi comparado** por quem escreveu isto: o ambiente de automação não alcança
`*.supabase.co` (`curl: (56) CONNECT tunnel failed, response 403`) e não tem conta nem credencial de teste. O que foi provado está em banco
PostgreSQL descartável (`scripts/test-migration-upgrade-path.sh`). O que falta é **executar as consultas abaixo no projeto de teste** e conferir os resultados.

> Antes de qualquer coisa: confirme **qual** projeto é o de teste. As issues citam o projeto `qadkqjfmmnxvovyyhqxw` ("kitesurf"), que também
> recebe o app publicado no Render. Não aplique nada nele se ele for o de produção com clientes reais.

## O que mudou em relação ao que a #296 propunha
A #296 **editava** a migration `20261115100000_fix_create_booking_instructor_race.sql`. Isso só seria seguro se ela nunca tivesse sido aplicada.
Para não depender dessa resposta:
- `20261115100000` voltou a ser **exatamente** o arquivo da base (sem diferença no `git diff` contra `claude/cool-ride-x47z5c`);
- o ajuste (tirar os `DEFAULT` da assinatura de 6 argumentos, com `DROP ... RESTRICT`) está na migration nova
  `20261116170000_create_booking_six_args_no_defaults.sql`, que roda **depois** da original **e depois** do delegado legado `20261116160000` (ver "Ordem segura" abaixo).
Serve tanto onde a original já foi aplicada quanto onde ainda não foi.

## Passo 0: consultas SOMENTE LEITURA para decidir (rode no SQL Editor do projeto de teste)
```sql
-- 0.1 Histórico oficial (pode estar vazio: a base foi montada à mão, ver #93). Copie o resultado como está.
select version from supabase_migrations.schema_migrations order by version desc limit 30;

-- 0.2 Assinaturas de create_booking e quantos DEFAULTS cada uma tem.
-- ESPERADO antes de aplicar: 2 linhas; a de 6 args com defaults = 2 (ou só a de 5 args, se nenhuma migration da #283 foi aplicada).
select p.oid::regprocedure::text as assinatura, p.pronargdefaults as defaults, p.prosecdef as definer
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'create_booking';

-- 0.3 A correção #283 (trava do instrutor) está aplicada? true = a original 20261115100000 JÁ rodou; false/null = ainda não.
select position('for update of i skip locked' in lower(pg_get_functiondef(p.oid))) > 0 as tem_trava_283
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'create_booking'
  and pg_get_function_identity_arguments(p.oid) like '%p_with_transport boolean';

-- 0.4 As migrations da #300 já estão (parcialmente) aplicadas? ESPERADO: 0 linhas na primeira, false/false na segunda.
select tgname from pg_trigger where tgname in ('guard_student_meeting_overlap_insert_update', 'guard_student_booking_activation_status') and not tgisinternal;
select to_regprocedure('public.guard_student_meeting_overlap()') is not null as guarda_existe;

-- 0.5 Dados que a trava do aluno (#298) passaria a recusar: alunos com dois encontros ATIVOS sobrepostos.
-- ESPERADO: 0 linhas. Se houver linhas, NÃO aplique 20261117190000 antes de resolver (a trava só vale para escritas novas,
-- mas esses pares travam qualquer remarcação/ativação futura da reserva).
select b1.student_id, m1.id as encontro_a, m2.id as encontro_b, m1.starts_at as a_inicio, m2.starts_at as b_inicio
from public.booking_meetings m1
join public.bookings b1 on b1.id = m1.booking_id
join public.booking_meetings m2 on m2.id > m1.id
join public.bookings b2 on b2.id = m2.booking_id and b2.student_id = b1.student_id
where m1.status::text <> 'cancelled' and m2.status::text <> 'cancelled'
  and b1.status::text in ('confirmed', 'awaiting_payment') and b2.status::text in ('confirmed', 'awaiting_payment')
  and tstzrange(m1.starts_at, m1.starts_at + make_interval(mins => m1.minutes), '[)') && tstzrange(m2.starts_at, m2.starts_at + make_interval(mins => m2.minutes), '[)');

-- 0.6 Duplo agendamento de INSTRUTOR já existente: docs/CONSULTA_duplo_agendamento_instrutor.sql (ESPERADO: 0 linhas).
```

### Tabela de decisão (corrigida em 19/11 após D1 a D6 reais)
**Leitura correta do indicador:** a trava `for update of i skip locked` existe em `create_booking` **desde a migration 07**; ela **não** é específica da #283. O que identifica a #283 é a **revalidação** depois da trava (`tem_revalidacao_283`). Em qualquer estado, a `20261115100000` **não** se reaplica num projeto existente: a `20261116170000` faz `DROP … RESTRICT` e recria a função de 6 args **inteira** (trava **e** revalidação, sem `DEFAULT`), entregando o corpo completo da #283. A original só é necessária num banco **novo** (já está na sequência).
| `tem_revalidacao_283` | Significado | O que aplicar |
|---|---|---|
| false | #283 ausente (**é o caso do projeto real**: a função é a da migration 10, sem a revalidação) | cadeia a partir de `20261116160000`; D7 confirma que nenhum ajuste manual será perdido |
| true | #283 completa (com 2 defaults) | cadeia a partir de `20261116160000` (a `170000` só tira os defaults) |

## Backup antes de aplicar (obrigatório)
Faça o backup pelo painel (Database > Backups) **ou** `pg_dump` da string de conexão do projeto de teste, e guarde o identificador/arquivo.
A restauração foi ensaiada em banco descartável por `scripts/test-migration-upgrade-path.sh` (dump → restore em outro cluster → contagens,
funções, políticas RLS, permissões de tabela/função, gatilhos e buckets idênticos). Restaurar no projeto real é decisão do responsável.

## Ordem de aplicação (cada arquivo já tem `begin; … commit;`, ou seja, é atômico)
Cole **um arquivo por vez** no SQL Editor do **projeto de teste**, confira a verificação e só então vá ao próximo.

| # | Arquivo | Verificação esperada logo depois |
|---|---|---|
| 1 | `20261115100000_fix_create_booking_instructor_race.sql` (**NÃO neste projeto**: só em banco novo; ver tabela de decisão) | `select position('for update of i skip locked' in lower(pg_get_functiondef('public.create_booking(uuid,public.lesson_level,text,jsonb,text,boolean)'::regprocedure))) > 0;` → `true` |
| 2 | `20261116160000_create_booking_legacy_safe_delegate.sql` | a de 5 args: `defaults = 1`, `definer = false` (e a de 6 args **ainda com 2 defaults**: normal neste passo); `select has_function_privilege('anon', 'public.create_booking(uuid,public.lesson_level,text,jsonb,text)'::regprocedure, 'EXECUTE');` → `false` |
| 3 | `20261116170000_create_booking_six_args_no_defaults.sql` | `select pronargdefaults from pg_proc where oid = 'public.create_booking(uuid,public.lesson_level,text,jsonb,text,boolean)'::regprocedure;` → `0` |
| 4 | `20261117190000_guard_student_meeting_overlap.sql` | as 2 linhas da consulta 0.4 (gatilhos) e `guarda_existe = true`; `has_function_privilege('authenticated', 'public.guard_student_meeting_overlap()'::regprocedure, 'EXECUTE')` → `false` |
| 5 | `20261119120000_offer_accept_student_conflict.sql` | `select position('offer.student_conflict' in pg_get_functiondef('public.accept_instructor_offer(uuid)'::regprocedure)) > 0;` → `true` |
| 6 | `20261119130000_meeting_change_student_conflict.sql` | `select position('student-meetings' in pg_get_functiondef('public.request_meeting_change(uuid,timestamptz,text)'::regprocedure)) > 0;` → `true` |
| 7 | `20261119140000_queue_expiry_job.sql` (não agenda nada) | `select has_function_privilege('authenticated', 'public.run_expiry_jobs()'::regprocedure, 'EXECUTE');` → `false` (idem `anon` e `run_queue_expiry_job(integer)`) |
| 8 | `20261120100000_confirm_payment_lock_order.sql` (PR separada, empilhada sobre a #300) | `select position('Booking changed, try again' in pg_get_functiondef('public.confirm_test_payment(uuid)'::regprocedure)) > 0;` → `true` |

Depois do último arquivo aplicado, rode de novo 0.2: **2 linhas**, 6 args com `defaults = 0`, 5 args com `defaults = 1`.
E confirme que as RPCs continuam fechadas ao anônimo:
```sql
select p.oid::regprocedure::text, has_function_privilege('anon', p.oid, 'EXECUTE') as anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') as autenticado
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in
 ('create_booking','accept_instructor_offer','request_meeting_change','respond_meeting_change','resolve_student_change','start_ordered_meeting','record_meeting','record_meeting_with_skills')
order by 1;   -- ESPERADO: anon = false em todas; autenticado = true em todas
```

## Se o SQL falhar
1. **Pare.** Não rode os arquivos seguintes. Cada arquivo é uma transação: o que falhou foi desfeito, o banco fica como estava.
2. Copie **a mensagem exata** do painel (código `SQLSTATE`, `DETAIL`, `CONTEXT`) para a issue #88.
3. Erro típico do passo 2: `cannot drop function … because other objects depend on it` — significa que algo depende da assinatura de 6 args; não use `CASCADE`. Envie a lista de dependentes.
4. O SQL em validação fica preservado no repositório (PR #300); não edite o arquivo aplicado, crie a próxima migration.

## Storage e permissões (o que já está coberto por teste em banco descartável)
`95_storage_private_buckets`, `97_documents`, `99_admin_avatars`, `99y_student_booking_avatar` e `99zzzzzzzz_chat_features` exercitam buckets privados,
documentos, fotos e anexos por papel. **Verificar no Supabase real** (consulta somente leitura): `select id, public from storage.buckets order by id;`
(buckets de documentos, avatares e anexos de chat devem ter `public = false`) e `select policyname, cmd, roles from pg_policies where schemaname = 'storage' order by 1;`.

## Resultado das consultas reais ao Supabase (19/11/2026, somente SELECT, via conector; PR #300, comentário do retorno)
Projeto `qadkqjfmmnxvovyyhqxw`:
- **Ledger** (`supabase_migrations.schema_migrations`): somente `20261110001348` (Protege 39), `20261110001427` (40), `20261110003527` (41, proteção segue registrada) e `20261110012944` (42).
- **Catálogo:** `create_booking(uuid,lesson_level,text,jsonb,text)` com **1 default**, `create_booking(uuid,lesson_level,text,jsonb,text,boolean)` com **2 defaults**, ambas `SECURITY DEFINER`, `anon` sem EXECUTE e `authenticated` com EXECUTE;
  `confirm_test_payment(uuid)` e `instructor_can_attend(uuid,jsonb)` com `anon` sem EXECUTE (esta última também sem EXECUTE para `authenticated`).

**Leitura correta:**
1. O ledger **não tem 01 a 38** (foram aplicadas à mão). Portanto "a `20261115100000` não consta no ledger" **não prova** que a trava da #283 esteja ausente. **A pergunta foi respondida pelo Passo 0 real** (abaixo): a trava da #283 **está** no corpo da função.
2. A assinatura de 6 args **mantém 2 defaults** e a de 5 args existe: hoje uma chamada de 5 argumentos por nome (PostgREST) é **ambígua** (`PGRST203`). Isso é uma condição pré-existente que a `20261116160000` corrige; não foi introduzida por estas PRs.
3. **Não aplicar nada neste projeto** sem conciliar (Q3, Q5, Q6) e revisar. **Não usar `supabase db push` aqui** (reaplicaria 01 a 38). A homologação autenticada deve ir para um projeto isolado: `docs/HOMOLOGACAO_PROJETO_ISOLADO.md`.
4. Escopo v1 informado pelo responsável: **16 frentes** (sem laboratório 3D e sem checkout real). Os totais passam a ser dados sobre 16, não 18.

## Passo 0 REAL executado em 19/11/2026 (somente leitura, issue #88, comentários do responsável) e decisão
Projeto `qadkqjfmmnxvovyyhqxw`. **Primeiro retorno (12:26):** ledger só com `20261110001348`, `20261110001427`, `20261110003527`, `20261110012944`; função de 6 args com a trava #283, 2 defaults e `SECURITY DEFINER`; de 5 args com 1 default e `SECURITY DEFINER`; guarda do aluno ausente; 0 pares sobrepostos de aluno e de instrutor; 9 assinaturas com `authenticated` sim e `anon` não.
**Retorno completo Q3 a Q11 (12:40), com uma CORREÇÃO:** a função de 6 args tem a **trava** mas **não tem a revalidação** depois dela (`tem_trava_283 = true`, `tem_revalidacao_283 = false`); a de 5 args não tem trava nem delega. Ou seja, a #283 está **incompleta (estado intermediário)** e a legada de 5 args é o caminho sem trava que a #296 fecha.
Também: guardas ausentes (Q4), 0 conflitos de aluno (Q5) e de instrutor (Q6); **6 buscas e 5 ofertas vencidas** (Q7; a #92 registrou 4 e 3); `pg_cron` **disponível (1.6.4) mas não instalado** (Q8); 6 buckets de Storage, **todos privados** (Q9); as **14 sondas** das migrations 01 a 38 todas presentes (Q10); contas: 1 aluno, 1 instrutor, 2 admins, 1 afiliado, e **1 instrutor aprovado por praia** (Q11).

**Decisão:** **NÃO reaplicar `20261115100000`.** A cadeia começa em `20261116160000` (delegado) e a `20261116170000` recria `create_booking` de 6 args completa. Ordem para ESTE projeto, quando houver revisão e backup:
`20261116160000` → `20261116170000` → `20261117190000` → `20261119120000` → `20261119130000` → `20261119140000` → `20261120100000` (esta última só na #303), cada uma conferida pela verificação da tabela de ordem.
**Antes** da cadeia: rodar o **D7** (hashes normalizados, que identificam a versão histórica de cada função) e conferir o resultado conforme "Resultado do D1 a D6 reais" abaixo.

**Leituras que afetam o plano:**
- **Q7:** ao agendar o job de expiração, as 6 buscas e 5 ofertas vencidas serão processadas na hora (expiram e a fila avança). Revise-as antes (consulta do Passo 0 de `docs/HOMOLOGACAO_FILA_92.md`).
- **Q8:** habilitar o `pg_cron` é possível (extensão disponível); ainda não está instalado.
- **Q11:** só há **1 instrutor aprovado por praia**; o ensaio A→B→C precisa de **3** na mesma praia. Isso **só pode ser feito num projeto isolado** (ou criando 2 instrutores fictícios de teste); não dá para homologar a fila no projeto como está.

### Deriva entre o projeto e o repositório (conferir ANTES de aplicar)
O projeto já divergiu do repositório uma vez: a assinatura legada de 5 args existe aqui e o repositório a apaga na migration 04. Como as migrations novas **substituem** funções
(`CREATE OR REPLACE`), uma alteração manual anterior seria sobrescrita em silêncio. Rode `docs/CONSULTA_DERIVA_ANTES_DE_APLICAR.sql` (somente leitura, validado nos dois estados num banco descartável):
- **D1:** `igual = true` em todas as linhas "substitui". Qualquer `false`: **não aplicar**, colar a saída na #88.
- **D2:** a função legada de 5 args com `nomes_ok = true`, retorno `uuid`, `defaults = 1` (o `CREATE OR REPLACE` da `20261116160000` exige os mesmos nomes de parâmetros; se `nomes_ok = false` a migration falharia e a transação desfaria tudo).
- **D3:** 0 dependentes (o `DROP … RESTRICT` da `20261116170000` falharia se houvesse). **D4:** `create_booking = 2`, demais `1`. **D5:** 0 linhas.
O teste `scripts/test-migration-upgrade-path.sh` agora parte de um banco **com a assinatura legada de 5 args presente** (como o projeto real) e prova que a `20261116160000` a substitui por delegado `SECURITY INVOKER`.

### Backup antes de aplicar (ainda não identificado)
O painel só oferece backups automáticos em alguns planos. **Não presuma**: confira em Database > Backups. Se não houver backup utilizável, faça um manual **antes** de qualquer migration:
```bash
# string de conexão em Project Settings > Database (use a do pooler ou a direta; senha do banco do responsável)
pg_dump "$DATABASE_URL" -Fc --no-owner -f kitesurf-antes-da-300-$(date +%Y%m%d).dump
pg_restore --list kitesurf-antes-da-300-*.dump | head   # confere que o arquivo abre
```
A restauração foi ensaiada em banco descartável (`scripts/test-migration-upgrade-path.sh`). Para ensaiar com os **dados reais**, restaure esse dump num projeto novo e aplique as migrations nele primeiro (variante B de `docs/HOMOLOGACAO_PROJETO_ISOLADO.md`).

## Ordem segura entre o delegado (`…160000`) e a remoção dos defaults (`…170000`)
Hoje os 2 `DEFAULT` da função de 6 args tornam **ambígua** (e portanto inalcançável pela API) uma chamada de 5 argumentos; isso protege, por acidente, a função **legada de 5 args**,
que é uma versão antiga **sem** `instructor_can_attend` (agenda, bloqueios, pausas) e **sem** trava. Se os defaults saíssem **antes** de a legada virar delegado, uma chamada de 5 argumentos
passaria a cair nessa versão antiga. Por isso o **delegado vem primeiro** (`20261116160000`) e só depois os defaults saem (`20261116170000`). O app não é afetado (ele sempre envia os 6 argumentos), mas a API é pública.

## Resultado do D1 a D6 reais (19/11/2026, 12:56) e o que foi concluído
- **D2 a D5 limpos:** a legada de 5 args tem `nomes_ok = true`, retorno `uuid`, 1 default (o `CREATE OR REPLACE` do delegado funciona); 0 dependentes; `create_booking = 2` e as demais funções `= 1`; nenhum nome conflitante.
- **create_booking (6 args), texto lido linha a linha:** idêntico ao do repositório **exceto** pela falta da revalidação depois da trava (comentários à parte). Comprovado de forma mecânica: o hash normalizado da versão do repositório **menos o bloco de revalidação** é igual ao hash da versão da **migration 10** (`5e398afc…`), ou seja, produção está exatamente na versão da migration 10. **A `20261116170000` não perde nenhum ajuste manual.**
- **create_booking (5 args):** é a versão **anterior à migration 04**: sem `instructor_can_attend`, sem trava, sem cancelamento de holds vencidos e sem a regra da primeira contratação do afiliado. Será substituída pelo delegado.
- **D1 `igual = false` em `accept_instructor_offer`, `confirm_test_payment`, `advance_instructor_offer`, `expire_balance_meeting_requests`:** o D1 compara o corpo **com comentários**, então pode ser só comentário/espaço. Para decidir, o **D7** compara o corpo **sem comentários e sem espaços** e diz **qual versão histórica** do repositório está em produção. `accept_instructor_offer` e `confirm_test_payment` são **substituídas** pela cadeia (`…120000` e `…20261120100000`); se o D7 mostrar uma versão **desconhecida**, não aplique essas duas até comparar o texto.
- **Pendentes no repositório mas fora do ledger:** as migrations `20261111020000` (45) e `20261111080000` (46) (políticas e grants de repasse de afiliado), `20261113000043` e `20261114002000` (`advance_instructor_offer`, disponibilidade do instrutor preferido). A 47 e a 48 já estão efetivas (aplicadas à mão). O D7 mostra qual versão de `advance_instructor_offer` está em produção; o job de expiração chama essa função, então confirme a versão antes de agendá-lo.

## D7 REAL (19/11/2026, 13:19, somente SELECT) e análise de impacto das migrations de instrutor preferido
Todas as 8 funções foram **reconhecidas** (nenhuma `DESCONHECIDA`):
| Função | Versão em produção |
|---|---|
| `create_booking` (6 args) | migration 10, **sem a revalidação #283** (`5e398abb…`) |
| `accept_instructor_offer` | **última** (migration 11): a `…120000` parte da base certa |
| `confirm_test_payment` | **última** (migration 10): a `…20261120100000` parte da base certa |
| `request_meeting_change`, `respond_meeting_change`, `expire_meeting_change_requests`, `expire_balance_meeting_requests` | **última** |
| `advance_instructor_offer` | **migration 14** (`07ba8bce…`), **não** a última: faltam `20261113000043` e `20261114002000` (instrutor preferido) |

**Conclusão: nenhuma substituição da cadeia perde algo; todas partem do corpo que o repositório espera.** O único desvio é `advance_instructor_offer` estar numa versão mais antiga, e isso **não** é substituído pela #300/#303.

**Impacto das duas migrations pendentes na #300 (testado):**
- A #300 **não depende** delas. `…120000` copia `accept_instructor_offer` (que já é a versão certa), e o job (`…140000`) só **chama** `advance_instructor_offer` pelo nome e pela assinatura, que são iguais nas duas versões.
- `scripts/test-prod-like-queue.sh` (novo, roda no `test-db.sh`) monta um banco **sem** essas duas migrations (confere o hash `07ba8bce…`) e roda os testes de fila (bordas, A→B→C, executor offline com 3 instrutores) e as janelas 12h+12h: **passam**.
- O que elas mudam é o comportamento da fila **para instrutor preferido** (um preferido sem agenda ainda pode oferecer outra data). É uma decisão **separada**: aplicá-las no projeto isolado e rodar `supabase/tests/29_preferred_instructor_availability` e `91_preferred_instructor_availability` antes de qualquer aplicação no projeto atual. Não é pré-requisito da #300.
- As migrations `20261111020000` (45) e `20261111080000` (46) (políticas e grants de repasse de afiliado) também estão fora do ledger; não afetam a #300 e precisam de conferência própria.
