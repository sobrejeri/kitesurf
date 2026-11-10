-- VentoKite Protege / Stage 3: backend release lock.
-- The browser feature flag is NOT a database authorization boundary. While
-- authenticated UI/Storage end-to-end QA remains pending, do not expose
-- mutation RPCs through PostgREST even to logged-in users.
-- No booking, lesson, payout, checkout, finance or existing record changed.
BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.submit_lesson_protection_statement(uuid,text,integer,text)') IS NULL
    OR to_regprocedure('public.review_lesson_protection_case(uuid,text,text)') IS NULL
    OR to_regprocedure('public.prepare_lesson_protection_evidence(uuid,text,text,integer)') IS NULL
    OR to_regprocedure('public.confirm_lesson_protection_evidence(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Stage 3 RPC dependencies missing; migration 39 must be present';
  END IF;
  -- Do not strand an in-progress private upload by disabling its confirmation.
  IF EXISTS (SELECT 1 FROM public.lesson_protection_evidence WHERE NOT confirmed) THEN
    RAISE EXCEPTION 'Pending evidence requires review before locking Stage 3 RPCs';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION
  public.submit_lesson_protection_statement(uuid,text,integer,text),
  public.review_lesson_protection_case(uuid,text,text),
  public.prepare_lesson_protection_evidence(uuid,text,text,integer),
  public.confirm_lesson_protection_evidence(uuid)
FROM PUBLIC, anon, authenticated;

-- SELECT RLS remains in place for future historic case reads. Reopening must
-- be a separate audited migration, AFTER actual-auth and Storage QA.
NOTIFY pgrst,'reload schema';
COMMIT;
