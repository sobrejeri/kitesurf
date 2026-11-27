-- Synthetic fixtures only. Every row mutation, audit and queue change rolls back.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
  student constant uuid := '00000000-0000-0000-0000-0000000000b1';
  other_student constant uuid := '00000000-0000-0000-0000-0000000000b2';
  instructor uuid := '00000000-0000-0000-0000-0000000000a1';
  beach uuid; moment timestamptz; booking uuid; before_state jsonb; after_state jsonb;
  denied boolean; paid_audits integer; queue_after bigint;
BEGIN
  SELECT id INTO STRICT beach FROM public.beaches WHERE slug='jeri';
  -- Pick a free future window without altering schedule rules or financial values.
  SELECT t INTO moment FROM (
    SELECT ((now() AT TIME ZONE 'America/Fortaleza')::date+d+time '10:00') AT TIME ZONE 'America/Fortaleza' t
    FROM generate_series(40,150) d
  ) slots WHERE public.instructor_can_attend(instructor,jsonb_build_array(jsonb_build_object('starts_at',t,'hours',1)))
    AND NOT public.student_has_meeting_overlap(student,t,60)
  ORDER BY t LIMIT 1;
  ASSERT moment IS NOT NULL,'no synthetic instructor slot available';
  PERFORM set_config('request.jwt.claim.sub',student::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
  booking:=public.create_booking(beach,'first_time','Português',jsonb_build_array(jsonb_build_object('starts_at',moment,'hours',1)));
  EXECUTE 'RESET ROLE';
  SELECT instructor_id INTO instructor FROM public.bookings WHERE id=booking;
  -- Represent an owner-bound pending booking whose instructor was released.
  UPDATE public.bookings SET instructor_id=NULL WHERE id=booking;
  SELECT jsonb_build_array(to_jsonb(b),
    (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.booking_meetings m WHERE m.booking_id=b.id),
    (SELECT count(*) FROM public.audit_logs),
    (SELECT jsonb_agg(jsonb_build_array(id,queue_position) ORDER BY id) FROM public.instructors))
    INTO before_state FROM public.bookings b WHERE b.id=booking;
  -- Ownership precedes the state guard: another student learns no booking state.
  denied:=false;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub',other_student::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM public.confirm_test_payment(booking);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN denied:=true;
  END;
  EXECUTE 'RESET ROLE'; ASSERT denied,'cross-owner payment must fail as not found';
  denied:=false;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub',student::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM public.confirm_test_payment(booking);
  EXCEPTION WHEN SQLSTATE '55000' THEN
    ASSERT SQLERRM='Booking has no instructor','unexpected refusal'; denied:=true;
  END;
  EXECUTE 'RESET ROLE'; ASSERT denied,'test payment must reject a booking without an instructor';
  SELECT jsonb_build_array(to_jsonb(b),
    (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.booking_meetings m WHERE m.booking_id=b.id),
    (SELECT count(*) FROM public.audit_logs),
    (SELECT jsonb_agg(jsonb_build_array(id,queue_position) ORDER BY id) FROM public.instructors))
    INTO after_state FROM public.bookings b WHERE b.id=booking;
  ASSERT after_state=before_state,'NULL refusal changed booking, meetings, audit or instructor queue';
  UPDATE public.bookings SET instructor_id=instructor WHERE id=booking;
  PERFORM set_config('request.jwt.claim.sub',student::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.confirm_test_payment(booking); EXECUTE 'RESET ROLE';
  ASSERT (SELECT status='confirmed' AND confirmed_at IS NOT NULL FROM public.bookings WHERE id=booking),'valid instructor confirmation failed';
  SELECT count(*) INTO paid_audits FROM public.audit_logs WHERE action='booking.payment_confirmed_test' AND entity_id=booking::text;
  ASSERT paid_audits=1,'valid confirmation must write one audit';
  SELECT queue_position INTO queue_after FROM public.instructors WHERE id=instructor;
  denied:=false;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub',student::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM public.confirm_test_payment(booking);
  EXCEPTION WHEN SQLSTATE '55000' THEN denied:=true;
  END;
  EXECUTE 'RESET ROLE'; ASSERT denied,'duplicate confirmation must fail';
  ASSERT (SELECT count(*) FROM public.audit_logs WHERE action='booking.payment_confirmed_test' AND entity_id=booking::text)=paid_audits,'duplicate wrote another audit';
  ASSERT (SELECT queue_position FROM public.instructors WHERE id=instructor)=queue_after,'duplicate moved instructor queue';
END $test$;
ROLLBACK;
SELECT 'PASS: NULL instructor rejected atomically; owner, valid instructor and duplicate confirmation preserved' AS result;
