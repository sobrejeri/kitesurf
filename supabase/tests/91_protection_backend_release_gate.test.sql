-- Stage 3 release gate must stay closed after the transactional RPC tests.
-- Runs on the ephemeral CI database only, without affecting production data.
DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon',
    'public.submit_lesson_protection_statement(uuid,text,integer,text)','EXECUTE'),
    'Anonymous access to statements must stay blocked';
  ASSERT NOT has_function_privilege('authenticated',
    'public.submit_lesson_protection_statement(uuid,text,integer,text)','EXECUTE'),
    'Statement RPC unexpectedly exposed before release';
  ASSERT NOT has_function_privilege('authenticated',
    'public.review_lesson_protection_case(uuid,text,text)','EXECUTE'),
    'Admin review RPC unexpectedly exposed before release';
  ASSERT NOT has_function_privilege('authenticated',
    'public.prepare_lesson_protection_evidence(uuid,text,text,integer)','EXECUTE'),
    'Private proof prepare RPC unexpectedly exposed before release';
  ASSERT NOT has_function_privilege('authenticated',
    'public.confirm_lesson_protection_evidence(uuid)','EXECUTE'),
    'Private proof confirm RPC unexpectedly exposed before release';
  ASSERT has_table_privilege('authenticated',
    'public.lesson_protection_statements','SELECT'),
    'RLS-protected historic statements should remain selectable';
  ASSERT NOT has_table_privilege('authenticated',
    'public.lesson_protection_statements','INSERT'),
    'No direct insert permission on protected statement rows';
END $$;
SELECT 'PASS: Stage3 mutation RPCs remain locked, even after RLS integration tests' AS result;
