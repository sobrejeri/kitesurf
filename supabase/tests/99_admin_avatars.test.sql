-- Vento: only admins can see avatar references across accounts.
-- Uses the test fixture identities and role helpers created in earlier tests.
\set ON_ERROR_STOP on

DO $$
DECLARE
  admin_id uuid := '00000000-0000-0000-0000-00000000000a';
  student_id uuid := '00000000-0000-0000-0000-0000000000b1';
BEGIN
  -- The functions must exist, and must not be executable as an ordinary student.
  PERFORM set_config('request.jwt.claim.sub', student_id::text, false);
  EXECUTE 'SET ROLE authenticated';
  BEGIN
    PERFORM public.get_admin_instructor_avatar_paths();
    RAISE EXCEPTION 'Student could list instructor avatar paths';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.get_admin_partner_avatar_paths();
    RAISE EXCEPTION 'Student could list partner avatar paths';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';

  -- An actual admin can call both functions without any extra RLS privileges
  -- on private contact/payout tables.
  PERFORM set_config('request.jwt.claim.sub', admin_id::text, false);
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.get_admin_instructor_avatar_paths();
  PERFORM public.get_admin_partner_avatar_paths();
  EXECUTE 'RESET ROLE';

  -- The instructor bucket must remain private; the new policy adds
  -- admin SELECT only, not INSERT/UPDATE/DELETE.
  ASSERT EXISTS(
    SELECT 1 FROM storage.buckets b
    WHERE b.id = 'vento-instructor-avatars' AND NOT b.public
  ), 'Instructor avatars must remain in a private bucket';

  ASSERT EXISTS(
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'storage' AND p.tablename = 'objects'
      AND p.policyname = 'vento_instructor_avatar_admin_select'
      AND p.cmd = 'SELECT'
  ), 'Missing read-only instructor avatar policy for admin';
END $$;
