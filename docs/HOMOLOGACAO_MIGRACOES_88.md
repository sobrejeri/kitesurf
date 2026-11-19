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
  `20261116160000_create_booking_six_args_no_defaults.sql`, que roda **depois** da original e **antes** do delegado legado `20261116170000`.
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

### Tabela de decisão
| 0.3 `tem_trava_283` | 0.2 defaults da assinatura de 6 args | O que aplicar |
|---|---|---|
| false ou sem linha | (qualquer) | `20261115100000`, depois todas as abaixo, na ordem |
| true | 2 | **não** reaplicar a original; aplicar só `20261116160000` em diante |
| true | 0 | a #296 original já foi aplicada à mão; aplicar `20261116160000` (é idempotente: o `DROP IF EXISTS` + `CREATE` recria igual) em diante |

## Backup antes de aplicar (obrigatório)
Faça o backup pelo painel (Database > Backups) **ou** `pg_dump` da string de conexão do projeto de teste, e guarde o identificador/arquivo.
A restauração foi ensaiada em banco descartável por `scripts/test-migration-upgrade-path.sh` (dump → restore em outro cluster → contagens,
funções, políticas RLS, permissões de tabela/função, gatilhos e buckets idênticos). Restaurar no projeto real é decisão do responsável.

## Ordem de aplicação (cada arquivo já tem `begin; … commit;`, ou seja, é atômico)
Cole **um arquivo por vez** no SQL Editor do **projeto de teste**, confira a verificação e só então vá ao próximo.

| # | Arquivo | Verificação esperada logo depois |
|---|---|---|
| 1 | `20261115100000_fix_create_booking_instructor_race.sql` (só se 0.3 deu false/null) | `select position('for update of i skip locked' in lower(pg_get_functiondef('public.create_booking(uuid,public.lesson_level,text,jsonb,text,boolean)'::regprocedure))) > 0;` → `true` |
| 2 | `20261116160000_create_booking_six_args_no_defaults.sql` | `select pronargdefaults from pg_proc where oid = 'public.create_booking(uuid,public.lesson_level,text,jsonb,text,boolean)'::regprocedure;` → `0` |
| 3 | `20261116170000_create_booking_legacy_safe_delegate.sql` | a de 5 args: `defaults = 1`, `definer = false`; `select has_function_privilege('anon', 'public.create_booking(uuid,public.lesson_level,text,jsonb,text)'::regprocedure, 'EXECUTE');` → `false` |
| 4 | `20261117190000_guard_student_meeting_overlap.sql` | as 2 linhas da consulta 0.4 (gatilhos) e `guarda_existe = true`; `has_function_privilege('authenticated', 'public.guard_student_meeting_overlap()'::regprocedure, 'EXECUTE')` → `false` |
| 5 | `20261119120000_offer_accept_student_conflict.sql` | `select position('offer.student_conflict' in pg_get_functiondef('public.accept_instructor_offer(uuid)'::regprocedure)) > 0;` → `true` |
| 6 | `20261119130000_meeting_change_student_conflict.sql` | `select position('student-meetings' in pg_get_functiondef('public.request_meeting_change(uuid,timestamptz,text)'::regprocedure)) > 0;` → `true` |

Depois do 6, rode de novo 0.2: **2 linhas**, 6 args com `defaults = 0`, 5 args com `defaults = 1`.
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
