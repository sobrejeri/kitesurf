-- Issue #145: ensure partner payout INSERT belongs to an actual partner owner.
-- Test runs against a throwaway PostgreSQL instance; transaction is rolled back.
BEGIN;
DO $test$
DECLARE
  owner_uid uuid := '00000000-0000-0000-0000-000000000145';
  stranger_uid uuid := '00000000-0000-0000-0000-000000000146';
  partner_uid uuid := '00000000-0000-0000-0000-000000000147';
  pol text;
  affected integer;
BEGIN
  SELECT with_check INTO pol
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'partner_payout_details'
    AND policyname = 'partner_payout_owner_insert'
    AND cmd = 'INSERT'
    AND 'authenticated' = ANY(roles);

  IF pol IS NULL OR pol NOT LIKE '%owner_id%' OR pol LIKE '%p.owner_id = p.id%' THEN
    RAISE EXCEPTION 'Partner payout INSERT must correlate to authenticated owner';
  END IF;

  -- Use a rolled-back owner fixture and verify INSERT succeeds as the owner.
  INSERT INTO auth.users(id,email) VALUES
    (owner_uid,'partner145@example.invalid'),
    (stranger_uid,'stranger145@example.invalid');

  -- auth.users creation triggers profile provisioning in the test schema.

  INSERT INTO public.partners(id,owner_id,name,code,status,beach_id)
  VALUES (partner_uid,owner_uid,'Partner L0 fixture','L0-P145','pending',
    (SELECT id FROM public.beaches ORDER BY id LIMIT 1));

  PERFORM set_config('request.jwt.claim.sub', owner_uid::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.partner_payout_details(id,method,holder_name,pix_key)
  VALUES (owner_uid,'pix','Test Owner','test-owner@example.invalid');

  -- Authenticate as the unrelated user: their own UID is valid, but no partner exists.
  PERFORM set_config('request.jwt.claim.sub', stranger_uid::text, true);
  BEGIN
    INSERT INTO public.partner_payout_details(id,method,holder_name,pix_key)
    VALUES (stranger_uid,'pix','Unauthorized','stranger@example.invalid');
    RAISE EXCEPTION 'Foreign payout INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- RLS must also hide the owner's payout from an unrelated authenticated user.
  IF EXISTS (SELECT 1 FROM public.partner_payout_details WHERE id = owner_uid) THEN
    RAISE EXCEPTION 'Foreign payout SELECT unexpectedly visible';
  END IF;

  UPDATE public.partner_payout_details
  SET holder_name = 'Unauthorized Update'
  WHERE id = owner_uid;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'Foreign payout UPDATE unexpectedly changed % rows', affected;
  END IF;

  -- DELETE must also be denied to a different authenticated user.\n  DELETE FROM public.partner_payout_details WHERE id = owner_uid;\n  GET DIAGNOSTICS affected = ROW_COUNT;\n  IF affected <> 0 THEN\n    RAISE EXCEPTION 'Foreign payout DELETE unexpectedly removed % rows', affected;\n  END IF;\n\n  -- The owner still sees their unchanged payout after the negative tests.
  PERFORM set_config('request.jwt.claim.sub', owner_uid::text, true);
  IF NOT EXISTS (
    SELECT 1 FROM public.partner_payout_details
    WHERE id = owner_uid AND holder_name = 'Test Owner'
  ) THEN
    RAISE EXCEPTION 'Owner payout no longer readable or was modified';
  END IF;
END
$test$;
ROLLBACK;
