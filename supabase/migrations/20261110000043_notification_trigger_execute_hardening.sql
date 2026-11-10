-- Migration 43 (PREPARED ONLY): harden four internal notification trigger functions.
-- Not applied to Supabase production. Existing migrations 39-42 unchanged.
-- Verified in production catalog: all four functions return trigger, are bound
-- to pg_trigger, are SECURITY DEFINER with fixed empty search_path, and have
-- EXECUTE granted to PUBLIC, anon and authenticated.
-- PostgreSQL checks EXECUTE on a trigger function when CREATE TRIGGER runs,
-- not when the trigger fires. Existing triggers remain operational.
-- Do not revoke from postgres/service_role (maintenance roles).
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'notify_booking_message',
    'notify_confirmed_booking',
    'notify_lesson_incident',
    'notify_offer_transition'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=fn
        AND p.pronargs=0 AND p.prorettype='pg_catalog.trigger'::regtype
        AND p.prosecdef
        AND EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgfoid=p.oid AND NOT t.tgisinternal)
    ) THEN
      RAISE EXCEPTION 'Refusing to change %. Trigger/SECURITY DEFINER baseline differs', fn;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I() FROM PUBLIC, anon, authenticated',fn);
  END LOOP;
END $$;
