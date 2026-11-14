-- Disposable PostgreSQL only. The review patch is intentionally NOT a migration.
-- scripts/test-db.sh runs this after the normal seeded business-rule suite.
\set ON_ERROR_STOP on
BEGIN;
\ir ../../security-review/lesson-rpc-gates.proposed.sql

DO $test$
BEGIN
  ASSERT NOT has_function_privilege('authenticated','public.start_meeting(uuid,text)','EXECUTE'),
    'Authenticated client must not bypass ordered start';
  ASSERT NOT has_function_privilege('authenticated','public.record_meeting(uuid,integer,text)','EXECUTE'),
    'Authenticated client must not bypass mandatory skill recording';
  ASSERT has_function_privilege('authenticated','public.start_ordered_meeting(uuid,text)','EXECUTE'),
    'Ordered start must remain callable';
  ASSERT has_function_privilege('authenticated',
    'public.record_meeting_with_skills(uuid,integer,integer[],integer[])','EXECUTE'),
    'Skill-aware completion must remain callable';
  ASSERT (SELECT prosecdef FROM pg_proc WHERE oid='public.start_ordered_meeting(uuid,text)'::regprocedure),
    'Ordered wrapper must be SECURITY DEFINER to call restricted helper';
  ASSERT (SELECT prosecdef FROM pg_proc WHERE oid='public.record_meeting_with_skills(uuid,integer,integer[],integer[])'::regprocedure),
    'Skills wrapper must be SECURITY DEFINER to call restricted helper';
END $test$;

SET ROLE authenticated;
DO $test$
BEGIN
  BEGIN
    PERFORM public.start_meeting('00000000-0000-0000-0000-000000000000', '0000');
    RAISE EXCEPTION 'Direct start_meeting unexpectedly executed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.record_meeting('00000000-0000-0000-0000-000000000000',0,'');
    RAISE EXCEPTION 'Direct record_meeting unexpectedly executed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $test$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: legacy lesson helper RPCs denied; validated wrappers retain grants' AS result;
