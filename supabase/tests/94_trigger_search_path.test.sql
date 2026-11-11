-- VentoKite L0: regression for prepared migration 44.
-- Runs only in the throwaway PostgreSQL instance created by scripts/test-db.sh.
-- This does not authorize or apply migration 44 to production.
DO $test$
DECLARE
  fn text;
  target_fn regprocedure;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'bookings_snapshot_frozen',
    'touch_updated_at',
    'reject_change',
    'reject_test_payment'
  ] LOOP
    target_fn := to_regprocedure(format('public.%I()', fn));
    IF target_fn IS NULL THEN
      RAISE EXCEPTION 'Migration 44 regression: missing function %', fn;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      WHERE p.oid = target_fn::oid
        AND p.prorettype = 'pg_catalog.trigger'::regtype
        AND p.prokind = 'f'
        AND NOT p.prosecdef
        AND p.proconfig @> ARRAY['search_path=pg_catalog']::text[]
    ) THEN
      RAISE EXCEPTION 'Migration 44 regression: % must remain SECURITY INVOKER trigger with fixed pg_catalog search_path', fn;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgfoid = target_fn::oid AND NOT t.tgisinternal
    ) THEN
      RAISE EXCEPTION 'Migration 44 regression: % lost its trigger binding', fn;
    END IF;
  END LOOP;
END
$test$;
