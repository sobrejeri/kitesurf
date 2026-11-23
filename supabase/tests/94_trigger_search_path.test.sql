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
        -- Estado real do Supabase (hotfix 20261123114943) = search_path="" ; a migration 44 preparada (nunca aplicada) usa pg_catalog.
        -- Os dois são FIXOS e seguros; o que a regressão proíbe é a função voltar a ter search_path mutável (sem configuração).
        AND (p.proconfig @> ARRAY['search_path=pg_catalog']::text[] OR p.proconfig @> ARRAY['search_path=""']::text[])
    ) THEN
      RAISE EXCEPTION 'Migration 44 regression: % must remain SECURITY INVOKER trigger with a FIXED search_path (pg_catalog or empty)', fn;
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
