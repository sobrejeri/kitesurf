-- #93: RLS contract for skill milestones. Runs only in disposable PostgreSQL.
-- Prevents silently hiding real meeting progress from Admin after a migration.
DO $test$
DECLARE
  admin_policy record;
  participant_policy record;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.meeting_skill_progress'::regclass) THEN
    RAISE EXCEPTION 'meeting_skill_progress must have RLS enabled';
  END IF;

  SELECT * INTO admin_policy FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meeting_skill_progress'
      AND policyname = 'meeting_skill_progress_admin_read';
  IF NOT FOUND OR admin_policy.cmd <> 'SELECT'
    OR NOT ('authenticated' = ANY(admin_policy.roles))
    OR admin_policy.qual NOT LIKE '%is_admin()%' THEN
    RAISE EXCEPTION 'Admin must have an authenticated, is_admin()-scoped SELECT policy';
  END IF;

  SELECT * INTO participant_policy FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meeting_skill_progress'
      AND policyname = 'meeting_skill_progress_participant_read';
  IF NOT FOUND OR participant_policy.cmd <> 'SELECT'
    OR NOT ('authenticated' = ANY(participant_policy.roles))
    OR participant_policy.qual NOT LIKE '%student_id%'
    OR participant_policy.qual NOT LIKE '%instructor_id%' THEN
    RAISE EXCEPTION 'Student and assigned instructor must retain scoped SELECT';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'meeting_skill_progress'
        AND policyname = 'meeting_skill_progress_admin_read' AND cmd <> 'SELECT') THEN
    RAISE EXCEPTION 'Admin skill policy must never grant writes';
  END IF;
  RAISE NOTICE 'PASS: meeting skill SELECT policies preserve Admin and participant access';
END
$test$;
