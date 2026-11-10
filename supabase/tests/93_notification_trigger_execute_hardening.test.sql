-- Regression: migration 43 must not expose internal notification triggers as RPCs.
DO $$
DECLARE fn text; oid regprocedure;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'notify_booking_message','notify_confirmed_booking',
    'notify_lesson_incident','notify_offer_transition'
  ] LOOP
    oid:=to_regprocedure(format('public.%I()',fn));
    IF oid IS NULL THEN RAISE EXCEPTION 'Missing trigger function %',fn; END IF;
    IF has_function_privilege('anon',oid,'EXECUTE')
       OR has_function_privilege('authenticated',oid,'EXECUTE') THEN
      RAISE EXCEPTION 'Internal trigger function % exposed via EXECUTE',fn;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgfoid=oid::oid AND NOT tgisinternal) THEN
      RAISE EXCEPTION 'Trigger binding missing for %',fn;
    END IF;
  END LOOP;
END $$;
