-- Regression for #91/#92: every candidate, including preferred, must pass instructor_can_attend.
DO $$
DECLARE body text;
BEGIN
  SELECT pg_get_functiondef('public.advance_instructor_offer(uuid)'::regprocedure) INTO body;
  IF body IS NULL THEN
    RAISE EXCEPTION 'advance_instructor_offer missing';
  END IF;
  IF position('if not public.instructor_can_attend(i.id,r.meetings)' in lower(body)) = 0 THEN
    RAISE EXCEPTION 'availability guard missing for queue candidates';
  END IF;
  IF position('i.id is distinct from r.preferred_instructor_id' in lower(body)) > 0 THEN
    RAISE EXCEPTION 'preferred instructor bypass still present';
  END IF;
END $$;


-- Behavioral regression in the disposable CI database (fixtures from 10_rules).
-- Both candidates are initially unavailable, then only the nonpreferred one
-- becomes available. No real Supabase records or production bookings are used.
DO $$
DECLARE
  v_start timestamptz;
  v_plan jsonb;
  v_preferred_block uuid;
  v_alternate_block uuid;
  v_request uuid;
  v_offer uuid;
  v_second uuid := '00000000-0000-0000-0000-0000000000a2'::uuid;
  v_first uuid := '00000000-0000-0000-0000-0000000000a1'::uuid;
BEGIN
  v_start := (((now() at time zone 'America/Fortaleza')::date + 90)::timestamp
             + interval '10 hours') at time zone 'America/Fortaleza';
  v_plan := jsonb_build_array(jsonb_build_object('starts_at', v_start, 'hours', 2));

  PERFORM pg_temp.act_as(v_first::text);
  v_preferred_block := public.block_my_time(v_start, v_start + interval '2 hours', 'QA preferred unavailable');
  PERFORM pg_temp.reset();
  PERFORM pg_temp.act_as(v_second::text);
  v_alternate_block := public.block_my_time(v_start, v_start + interval '2 hours', 'QA alternate initially unavailable');
  PERFORM pg_temp.reset();

  PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
  v_request := public.create_instructor_request(
    (SELECT id FROM public.beaches WHERE slug = 'prea'),
    'first_time', 'Português', v_plan, NULL, false);
  PERFORM pg_temp.reset();
  ASSERT v_request IS NOT NULL, 'request created for temporarily unavailable instructors';
  ASSERT NOT EXISTS (SELECT 1 FROM public.instructor_offers WHERE request_id = v_request),
    'neither unavailable candidate should receive an offer';

  UPDATE public.instructor_requests
    SET preferred_instructor_id = v_first
    WHERE id = v_request;

  PERFORM pg_temp.act_as(v_second::text);
  PERFORM public.unblock_my_time(v_alternate_block);
  PERFORM pg_temp.reset();

  ASSERT NOT public.instructor_can_attend(v_first, v_plan),
    'preferred candidate remains unavailable';
  ASSERT public.instructor_can_attend(v_second, v_plan),
    'alternate candidate is available';

  v_offer := public.advance_instructor_offer(v_request);
  ASSERT v_offer IS NOT NULL, 'queue must continue to available alternate';
  ASSERT (SELECT instructor_id FROM public.instructor_offers WHERE id = v_offer) = v_second,
    'unavailable preferred instructor must be skipped';
  ASSERT public.advance_instructor_offer(v_request) = v_offer,
    'repeat advance must be idempotent';
  ASSERT (SELECT count(*) FROM public.instructor_offers WHERE request_id = v_request) = 1,
    'repeat advance must not duplicate offers';

  PERFORM pg_temp.act_as(v_first::text);
  PERFORM public.unblock_my_time(v_preferred_block);
  PERFORM pg_temp.reset();
END $$;
