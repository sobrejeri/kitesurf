-- VentoKite L0 / migration 44 (PREPARADA, NAO APLICAR SEM HOMOLOGACAO)
-- Corrige function_search_path_mutable em quatro triggers invoker sem alterar corpo.
-- Sem checkout, sem DML, sem tocar migrations 39-42 ou Protege 3B.
BEGIN;
DO $guard$
DECLARE
  fn text;
  fn_oid oid;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'bookings_snapshot_frozen', 'touch_updated_at',
    'reject_change', 'reject_test_payment'
  ] LOOP
    fn_oid := to_regprocedure(format('public.%I()', fn));
    IF fn_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = fn_oid
        AND p.prorettype = 'pg_catalog.trigger'::regtype
        AND NOT p.prosecdef
        AND p.prokind = 'f'
    ) THEN
      RAISE EXCEPTION 'VentoKite migration 44: unexpected trigger signature/security for %', fn;
    END IF;
  END LOOP;
END
$guard$;

ALTER FUNCTION public.bookings_snapshot_frozen() SET search_path = pg_catalog;
ALTER FUNCTION public.touch_updated_at() SET search_path = pg_catalog;
ALTER FUNCTION public.reject_change() SET search_path = pg_catalog;
ALTER FUNCTION public.reject_test_payment() SET search_path = pg_catalog;

DO $verify$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['bookings_snapshot_frozen','touch_updated_at','reject_change','reject_test_payment'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn
        AND p.pronargs = 0 AND p.proconfig @> ARRAY['search_path=pg_catalog']::text[]
    ) THEN RAISE EXCEPTION 'VentoKite migration 44: search_path verification failed: %', fn;
    END IF;
  END LOOP;
END
$verify$;
COMMIT;
