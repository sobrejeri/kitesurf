BEGIN;
REVOKE EXECUTE ON FUNCTION public.notify_booking_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_confirmed_booking() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_lesson_incident() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_offer_transition() FROM PUBLIC, anon, authenticated;
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['notify_booking_message','notify_confirmed_booking','notify_lesson_incident','notify_offer_transition'] LOOP IF has_function_privilege('anon',format('public.%I()',n),'EXECUTE') OR has_function_privilege('authenticated',format('public.%I()',n),'EXECUTE') THEN RAISE EXCEPTION 'Trigger function % still callable',n; END IF; END LOOP; END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
