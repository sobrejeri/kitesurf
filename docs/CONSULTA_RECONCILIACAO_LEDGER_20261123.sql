-- RECONCILIAÇÃO 23/11/2026 (lote de 10, item 1). SOMENTE LEITURA: nenhuma instrução altera nada. Projeto: Supabase Kitesurf (qadkqjfmmnxvovyyhqxw).
-- Devolva a saída de cada bloco. Objetivo: provar o que o ledger e o banco realmente têm, antes de aplicar qualquer parte da PR #323.

-- R1 Ledger completo. Esperado (pelos comentários de 19–23/11): 39..42, 20261121111421 (admin read), 20261123114519, 20261123114813, 20261123114943.
select version, name from supabase_migrations.schema_migrations order by version;

-- R2 Texto aplicado dos hotfixes (compare com supabase/migrations/20261123114519_*, 20261123114813_*, 20261123114943_*, que são RECONSTRUÇÕES).
select version, name, statements from supabase_migrations.schema_migrations
where version in ('20261121111421', '20261123114519', '20261123114813', '20261123114943') order by version;

-- R3 Privilégios efetivos (esperado: start_meeting anon=false auth=false; start_ordered_meeting anon=false auth=true; notify_* todos false).
select p.oid::regprocedure::text as funcao,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
from pg_proc p where p.pronamespace = 'public'::regnamespace
  and p.proname in ('start_meeting', 'start_ordered_meeting', 'notify_booking_message', 'notify_confirmed_booking', 'notify_lesson_incident', 'notify_offer_transition',
                    'interrupt_meeting', 'schedule_meeting_resume', 'complete_meeting_with_skills') order by 1;

-- R4 search_path das 4 funções (esperado: {search_path=""}) e se ainda há gatilho ligado a cada uma.
select p.oid::regprocedure::text as funcao, p.proconfig, p.prosecdef as security_definer,
       (select count(*) from pg_trigger t where t.tgfoid = p.oid and not t.tgisinternal) as gatilhos
from pg_proc p where p.pronamespace = 'public'::regnamespace
  and p.proname in ('bookings_snapshot_frozen', 'touch_updated_at', 'reject_change', 'reject_test_payment') order by 1;

-- R5 A migration 20261121120000 (PR #323) NÃO deve estar aplicada. Esperado: 0 linhas nos dois SELECTs.
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'booking_meetings'
  and column_name in ('planned_minutes', 'previous_done_minutes', 'interruption_state', 'interruption_reason', 'interrupted_at', 'remaining_minutes', 'interruption_count', 'resume_scheduled_at');
select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('interrupt_meeting', 'schedule_meeting_resume', 'complete_meeting_with_skills', 'save_meeting_steps', 'assert_valid_meeting_steps');

-- R6 Qual versão de start_ordered_meeting está em produção? (hash do corpo sem comentários e sem espaços)
--    f2cee766c646bcd3c8f4dd9f345fa10b = dia do calendário (migration 26)  -> 20261120120000 (24h) AINDA NÃO aplicada
--    e4d2388f9f2feb81e60141659c81dfa8 = 24h (20261120120000)              -> aplicada
--    0a43a8db20b25a9cfdab30c4e8c22323 = a da PR #323 (20261121120000)      -> aplicada (não esperado)
select md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as hash_normalizado
from pg_proc where pronamespace = 'public'::regnamespace and proname = 'start_ordered_meeting';

-- R7 Quais migrations da cadeia #300/#303 já estão em produção? (sondas: existência de cada objeto; ver docs/CONSULTA_DERIVA_ANTES_DE_APLICAR.sql para os hashes)
select 'run_expiry_jobs (20261119140000)' as sonda, to_regprocedure('public.run_expiry_jobs()') is not null as presente
union all select 'guard_student_meeting_overlap (20261117190000)', to_regprocedure('public.guard_student_meeting_overlap()') is not null
union all select 'confirm_test_payment com trava (20261120100000)', position('Booking changed, try again' in pg_get_functiondef('public.confirm_test_payment(uuid)'::regprocedure)) > 0
union all select 'policy admin read de habilidades (20261121000043 / 20261121111421)', exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'meeting_skill_progress' and policyname = 'meeting_skill_progress_admin_read');
