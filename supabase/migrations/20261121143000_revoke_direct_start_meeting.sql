-- #93 P0: block direct RPC invocation of the unguarded legacy starter.
-- start_ordered_meeting is SECURITY DEFINER and calls start_meeting internally
-- as its owner, retaining the PIN, date and ordering checks.
-- Do not alter existing meetings or grants on start_ordered_meeting.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.start_meeting(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_meeting(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.start_meeting(uuid, text) FROM authenticated;
-- Explicitly fail closed if another migration has restored a direct grant.
DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.start_meeting(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.start_meeting(uuid,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'P0 start_meeting direct EXECUTE still exposed';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.start_ordered_meeting(uuid,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Ordered starter no longer callable by authenticated';
  END IF;
END;
$$;
COMMIT;
