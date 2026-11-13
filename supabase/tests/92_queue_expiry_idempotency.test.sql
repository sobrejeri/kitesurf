-- #92: queue expiry is safe to retry; disposable PostgreSQL CI only.
-- No production records, scheduler activation or financial operations.
CREATE FUNCTION pg_temp.act_as(uid text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', uid, false);
  EXECUTE 'SET ROLE authenticated';
END $$;
CREATE FUNCTION pg_temp.reset() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', false);
END $$;

DO $$
DECLARE
  v_request uuid;
  v_offer uuid;
  v_start timestamptz;
  v_meetings jsonb;
BEGIN
  v_start := (((now() at time zone 'America/Fortaleza')::date + 75)::timestamp
    + interval '10 hours') at time zone 'America/Fortaleza';
  v_meetings := jsonb_build_array(jsonb_build_object('starts_at',v_start,'hours',2));

  PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
  v_request := public.create_instructor_request(
    (SELECT id FROM public.beaches WHERE slug='prea'),
    'first_time','Português',v_meetings,NULL,false
  );
  PERFORM pg_temp.reset();
  ASSERT v_request IS NOT NULL, 'fixture request must exist';

  SELECT id INTO v_offer FROM public.instructor_offers
    WHERE request_id=v_request AND status='offered' LIMIT 1;
  ASSERT v_offer IS NOT NULL, 'fixture must have a live offer';

  -- Simulate clock expiry by changing only disposable fixture rows.
  UPDATE public.instructor_requests SET expires_at=now()-interval '1 minute'
    WHERE id=v_request;
  ASSERT public.advance_instructor_offer(v_request) IS NULL,
    'expired request must never produce a new offer';
  ASSERT (SELECT status FROM public.instructor_requests WHERE id=v_request)='expired',
    'expired request must reach terminal state';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.instructor_offers
    WHERE request_id=v_request AND status IN ('offered','suggested')
  ), 'no actionable offers may remain after expiry';
  ASSERT (SELECT status FROM public.instructor_offers WHERE id=v_offer)='expired',
    'existing offer must expire with its request';

  ASSERT public.advance_instructor_offer(v_request) IS NULL,
    'replaying expiry must be idempotent';
  ASSERT (SELECT count(*) FROM public.instructor_offers WHERE request_id=v_request)=1,
    'replay must not create another offer';
END $$;
