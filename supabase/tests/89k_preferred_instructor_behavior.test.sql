-- #92 behavioral regression: preferred instructor must obey availability.
-- Runs after 10_rules fixture, inside rollback-only transaction.
-- Preferred-instructor requests require a previous lesson with that instructor.
-- Luana (b1) has a confirmed Rafael lesson; the busy slot comes from
-- another student's (b2) Rafael booking, so Luana is free at that time.
BEGIN;
DO $$
DECLARE
  beach uuid;
  busy_slots jsonb;
  free_slots jsonb;
  req uuid;
  offered uuid;
  chosen uuid;
  preferred constant uuid := '00000000-0000-0000-0000-0000000000a1';
  alternate constant uuid := '00000000-0000-0000-0000-0000000000a2';
BEGIN
  SELECT id INTO STRICT beach FROM public.beaches WHERE slug='prea';
  -- Rafael is busy teaching b2; b1 must not have a conflicting lesson.
  SELECT jsonb_build_array(jsonb_build_object('starts_at',bm.starts_at,'hours',1))
    INTO STRICT busy_slots
  FROM public.booking_meetings bm
  JOIN public.bookings b ON b.id=bm.booking_id
  WHERE b.student_id='00000000-0000-0000-0000-0000000000b2'
    AND b.instructor_id=preferred
  ORDER BY bm.starts_at LIMIT 1;
  IF public.instructor_can_attend(preferred,busy_slots) THEN
    RAISE EXCEPTION 'Invalid fixture: preferred instructor is not busy';
  END IF;
  IF NOT public.instructor_can_attend(alternate,busy_slots) THEN
    RAISE EXCEPTION 'Invalid fixture: alternate instructor is not available';
  END IF;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  req := public.create_instructor_request_with_preference(
    beach,'returning','Português',busy_slots,null,false,preferred);
  EXECUTE 'RESET ROLE';
  SELECT id,instructor_id INTO offered,chosen FROM public.instructor_offers
    WHERE request_id=req AND status='offered';
  IF chosen IS DISTINCT FROM alternate THEN
    RAISE EXCEPTION 'P0: preferred busy, expected alternate %, got %',alternate,chosen;
  END IF;
  IF (SELECT count(*) FROM public.instructor_offers WHERE request_id=req AND status='offered')<>1 THEN
    RAISE EXCEPTION 'Duplicate active offers in preferred-busy scenario';
  END IF;

  -- With English only Rafael qualifies, but he is busy: no offer is allowed.
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  req := public.create_instructor_request_with_preference(
    beach,'returning','Inglês',busy_slots,null,false,preferred);
  EXECUTE 'RESET ROLE';
  IF EXISTS(SELECT 1 FROM public.instructor_offers WHERE request_id=req AND status='offered') THEN
    RAISE EXCEPTION 'P0: offered unavailable preferred with no alternate';
  END IF;

  -- On a free future date, the preferred instructor retains priority.
  SELECT jsonb_build_array(jsonb_build_object('starts_at',st,'hours',1))
    INTO free_slots
  FROM (
    SELECT (date_trunc('day',now() AT TIME ZONE 'America/Fortaleza')
      +make_interval(days=>d,hours=>10)) AT TIME ZONE 'America/Fortaleza' AS st
    FROM generate_series(25,45) d
  ) candidates
  WHERE public.instructor_can_attend(preferred,
    jsonb_build_array(jsonb_build_object('starts_at',st,'hours',1)))
  ORDER BY st LIMIT 1;
  IF free_slots IS NULL THEN RAISE EXCEPTION 'No free fixture date'; END IF;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  req := public.create_instructor_request_with_preference(
    beach,'returning','Português',free_slots,null,false,preferred);
  EXECUTE 'RESET ROLE';
  SELECT instructor_id INTO chosen FROM public.instructor_offers
    WHERE request_id=req AND status='offered';
  IF chosen IS DISTINCT FROM preferred THEN
    RAISE EXCEPTION 'Preferred available, expected %, got %',preferred,chosen;
  END IF;
  RAISE NOTICE 'PASS: busy preferred -> alternate; no alternate -> no offer; free preferred -> preferred';
END $$;
ROLLBACK;
