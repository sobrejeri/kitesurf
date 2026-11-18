-- P0 #90/#91: regression contract for student overlap protection.
-- Executed only by scripts/test-db.sh on disposable PostgreSQL.
-- This test does not change production data or authorize E2E claims.
DO $$
DECLARE
  v_guard oid := to_regprocedure('public.guard_student_meeting_overlap()');
  v_activation oid := to_regprocedure('public.guard_student_booking_activation()');
  v_helper oid := to_regprocedure('public.guard_student_meeting_overlap_for_activation(uuid,uuid,timestamptz,integer)');
BEGIN
  IF v_guard IS NULL OR v_activation IS NULL OR v_helper IS NULL THEN
    RAISE EXCEPTION 'Student overlap guard functions missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.booking_meetings'::regclass
      AND tgname = 'guard_student_meeting_overlap_insert_update'
      AND NOT tgisinternal AND tgenabled = 'O'
      AND tgfoid = v_guard
  ) THEN
    RAISE EXCEPTION 'Student meeting overlap trigger missing or disabled';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.bookings'::regclass
      AND tgname = 'guard_student_booking_activation_status'
      AND NOT tgisinternal AND tgenabled = 'O'
      AND tgfoid = v_activation
  ) THEN
    RAISE EXCEPTION 'Student booking activation trigger missing or disabled';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid IN (v_guard, v_activation, v_helper)
      AND (NOT prosecdef OR proconfig IS NULL
        OR NOT ('search_path=' = ANY(proconfig)))
  ) THEN
    RAISE EXCEPTION 'Student guard functions must use SECURITY DEFINER and empty search_path';
  END IF;
  IF has_function_privilege('anon', v_guard, 'EXECUTE')
    OR has_function_privilege('authenticated', v_guard, 'EXECUTE')
    OR has_function_privilege('anon', v_activation, 'EXECUTE')
    OR has_function_privilege('authenticated', v_activation, 'EXECUTE')
    OR has_function_privilege('anon', v_helper, 'EXECUTE')
    OR has_function_privilege('authenticated', v_helper, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Student guard internals must not be callable by API roles';
  END IF;
END $$;
