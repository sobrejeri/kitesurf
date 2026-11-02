-- Migration 31: instructor-only exit and existing-booking queue handoff.
-- Atomic fixtures; never affects persisted data.
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.as_31(p_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub',p_uid::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
CREATE FUNCTION pg_temp.reset_31() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub','',true);
END $$;

DO $$
DECLARE
  v_admin uuid:='00000000-0000-0000-0000-00000000000a';
  v_instructor uuid:='00000000-0000-0000-0000-0000000000a2';
  v_substitute uuid:='00000000-0000-0000-0000-0000000000a1';
  v_student uuid:='00000000-0000-0000-0000-0000000000b2';
  v_other_student uuid:='00000000-0000-0000-0000-0000000000b1';
  v_beach uuid;
  v_start timestamptz;
  v_booking uuid;
  v_meeting uuid;
  v_offer uuid;
  v_total integer;
  v_net integer;
  v_code text;
  v_change uuid;
BEGIN
  SELECT id INTO v_beach FROM public.beaches WHERE slug='prea';
  v_start:=(((now() AT TIME ZONE 'America/Fortaleza')::date+35)::timestamp
     +interval '11 hours') AT TIME ZONE 'America/Fortaleza';
  PERFORM pg_temp.as_31(v_admin);
  v_booking:=public.create_admin_test_booking(v_instructor,v_student,v_beach,
    jsonb_build_array(jsonb_build_object('starts_at',
      to_char(v_start AT TIME ZONE 'America/Fortaleza',
        'YYYY-MM-DD"T"HH24:MI:SS')||'-03:00','hours',2)));
  PERFORM pg_temp.reset_31();
  SELECT id INTO v_meeting FROM public.booking_meetings WHERE booking_id=v_booking;
  SELECT code,total_cents,instructor_net_cents INTO v_code,v_total,v_net
    FROM public.bookings WHERE id=v_booking;

  PERFORM pg_temp.as_31(v_other_student);
  BEGIN
    PERFORM public.request_meeting_change(
      v_meeting,v_start+interval '7 days','Unauthorized student request');
    RAISE EXCEPTION 'Third-party access allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.reset_31();

  PERFORM pg_temp.as_31(v_student);
  BEGIN
    PERFORM public.request_meeting_change(
      v_meeting,v_start-interval '1 day','Please anticipate by one day');
    RAISE EXCEPTION 'Earlier date was incorrectly accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    ASSERT SQLERRM='New date must be after original meeting';
  END;
  PERFORM pg_temp.reset_31();

  PERFORM pg_temp.as_31(v_instructor);
  PERFORM public.release_my_booking(v_booking,'Instrutor indisponível para esse dia.');
  PERFORM pg_temp.reset_31();
  ASSERT (SELECT status FROM public.bookings WHERE id=v_booking)='confirmed',
    'Instructor exit must not cancel the paid booking';
  ASSERT (SELECT instructor_id FROM public.bookings WHERE id=v_booking) IS NULL,
    'Instructor should be unassigned while searching';
  ASSERT (SELECT status FROM public.booking_meetings WHERE id=v_meeting)='scheduled',
    'Meeting must retain date and scheduled status';
  ASSERT EXISTS(SELECT 1 FROM public.booking_reassignments
    WHERE booking_id=v_booking AND previous_instructor=v_instructor
      AND status='searching'),'Queue was not started';

  SELECT o.id INTO v_offer FROM public.booking_reassignment_offers o
    JOIN public.booking_reassignments r ON r.id=o.reassignment_id
    WHERE r.booking_id=v_booking AND o.instructor_id=v_substitute AND o.status='offered';
  ASSERT v_offer IS NOT NULL, 'Next qualified instructor receives the offer';
  PERFORM pg_temp.as_31(v_substitute);
  PERFORM public.respond_booking_reassignment(v_offer,true);
  PERFORM pg_temp.reset_31();
  ASSERT (SELECT instructor_id FROM public.bookings WHERE id=v_booking)=v_substitute,
    'New instructor must accept the original booking';
  ASSERT (SELECT status FROM public.bookings WHERE id=v_booking)='confirmed',
    'Accepted transfer does not create a new booking';
  ASSERT EXISTS(SELECT 1 FROM public.bookings
    WHERE id=v_booking AND code=v_code
      AND total_cents=v_total AND instructor_net_cents=v_net),
    'A reassignment must preserve all financial snapshot amounts';
  ASSERT (SELECT starts_at FROM public.booking_meetings WHERE id=v_meeting)=v_start,
    'Original booking date was changed unexpectedly';

  -- Separate booking: rejected change gives the student an explicit cancel button.
  PERFORM pg_temp.as_31(v_admin);
  v_booking:=public.create_admin_test_booking(v_instructor,v_student,v_beach,
    jsonb_build_array(jsonb_build_object('starts_at',
      to_char((v_start+interval '14 days') AT TIME ZONE 'America/Fortaleza',
        'YYYY-MM-DD"T"HH24:MI:SS')||'-03:00','hours',2)));
  PERFORM pg_temp.reset_31();
  SELECT id INTO v_meeting FROM public.booking_meetings WHERE booking_id=v_booking;
  PERFORM pg_temp.as_31(v_student);
  v_change:=public.request_meeting_change(
    v_meeting,v_start+interval '21 days','Student requests later meeting date.');
  PERFORM pg_temp.reset_31();
  ASSERT (SELECT expires_at-requested_at FROM public.meeting_change_requests
    WHERE id=v_change)<=interval '12 hours 1 minute','Reply deadline is not 12h';

  PERFORM pg_temp.as_31(v_instructor);
  PERFORM public.respond_meeting_change(v_change,false);
  PERFORM pg_temp.reset_31();
  ASSERT (SELECT choice_expires_at FROM public.meeting_change_requests WHERE id=v_change)>now(),
    'The student must receive a 12h choice window';

  PERFORM pg_temp.as_31(v_student);
  PERFORM public.resolve_student_change(v_change,'cancel');
  PERFORM pg_temp.reset_31();
  ASSERT (SELECT status FROM public.bookings WHERE id=v_booking)='cancelled',
    'Student explicitly cancels when instructor declines';
  ASSERT (SELECT resolution FROM public.meeting_change_requests WHERE id=v_change)='cancelled',
    'Cancellation records student choice';
END $$;
ROLLBACK;