-- Run only in disposable PostgreSQL after proposed guard.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  beach uuid;
  d timestamptz;
  slots jsonb;
  before_count bigint;
  msg text;
BEGIN
  SELECT id INTO STRICT beach FROM public.beaches WHERE slug='prea';
  d := (date_trunc('day', now() AT TIME ZONE 'America/Fortaleza') + interval '30 days 9 hours') AT TIME ZONE 'America/Fortaleza';
  slots := jsonb_build_array(jsonb_build_object('starts_at',d,'hours',1),
                             jsonb_build_object('starts_at',d+interval '3 hours','hours',1));
  SELECT count(*) INTO before_count FROM public.instructor_requests;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
  EXECUTE 'set local role authenticated';
  BEGIN
    PERFORM public.create_instructor_request(beach,'first_time','Português',slots);
    RAISE EXCEPTION 'generic RPC accepted two meetings on same day';
  EXCEPTION WHEN invalid_parameter_value THEN
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
    IF msg NOT LIKE '%one meeting per local calendar day%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.create_instructor_request_with_preference(beach,'first_time','Português',slots,null,false,null);
    RAISE EXCEPTION 'preference RPC accepted two meetings on same day';
  EXCEPTION WHEN invalid_parameter_value THEN
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
    IF msg NOT LIKE '%one meeting per local calendar day%' THEN RAISE; END IF;
  END;
  EXECUTE 'reset role';
  ASSERT (SELECT count(*) FROM public.instructor_requests)=before_count, 'invalid requests must not persist';
END $$;
ROLLBACK;
SELECT 'PASS: both request RPCs reject distinct times on the same Fortaleza day' AS result;
