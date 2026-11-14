-- REVIEW-ONLY SECURITY PATCH: do not apply directly to production.
-- Goal: stop authenticated users bypassing ordered start and mandatory skill capture.
-- Observed 2026-11-14 in kitesurf Supabase: all four functions SECURITY DEFINER.
-- Verify all application RPC call sites and execute on disposable PostgreSQL first.
-- Do not install as a numbered migration until migration baseline is reconciled.
-- Transaction ownership belongs to the caller (the isolated test wraps in BEGIN/ROLLBACK).

-- The client must use start_ordered_meeting, not its less restrictive helper.
-- The client must use record_meeting_with_skills, not its less restrictive helper.
-- REVOKE from PUBLIC is essential: PUBLIC grants are inherited by authenticated.
REVOKE EXECUTE ON FUNCTION public.start_meeting(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_meeting(uuid,integer,text) FROM PUBLIC, anon, authenticated;

-- Ensure the validated entry points remain usable only by signed-in clients.
REVOKE EXECUTE ON FUNCTION public.start_ordered_meeting(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_meeting_with_skills(uuid,integer,integer[],integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_ordered_meeting(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_meeting_with_skills(uuid,integer,integer[],integer[]) TO authenticated;

-- Fail closed if the internal functions remain executable via inherited roles.
DO $guard$
BEGIN
  IF has_function_privilege('authenticated','public.start_meeting(uuid,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.record_meeting(uuid,integer,text)','EXECUTE')
     OR has_function_privilege('anon','public.start_meeting(uuid,text)','EXECUTE')
     OR has_function_privilege('anon','public.record_meeting(uuid,integer,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Internal lesson RPC still exposed';
  END IF;
  IF NOT has_function_privilege('authenticated','public.start_ordered_meeting(uuid,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.record_meeting_with_skills(uuid,integer,integer[],integer[])','EXECUTE') THEN
    RAISE EXCEPTION 'Validated lesson RPC became inaccessible';
  END IF;
END
$guard$;
-- Pending before deployment:
-- 1. Confirm SECURITY DEFINER wrappers still call helpers after REVOKE.
-- 2. Run authenticated tests: direct helper calls denied (42501);
--    wrappers accept only assigned instructor with valid PIN and skill lists.
-- 3. Test next-day and out-of-order starts; clarify 24-hour rule separately.
-- 4. Audit other helper grants, app RPC references and legacy clients.
-- 5. Deploy only after review, CI and rollback plan; checkout remains OFF.
