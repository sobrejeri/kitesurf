-- Regression for #93: legacy starter must not be callable as an API RPC.
-- This test is deliberately non-mutating and can run in the existing SQL suite.
DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.start_meeting(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.start_meeting(uuid,text)', 'EXECUTE')
     OR has_function_privilege('PUBLIC', 'public.start_meeting(uuid,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'P0: direct legacy start_meeting exposed';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.start_ordered_meeting(uuid,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'ordered start_meeting API unexpectedly revoked';
  END IF;
  RAISE NOTICE 'PASS: direct legacy starter closed, ordered starter remains callable';
END;
$$;
