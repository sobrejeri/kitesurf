-- Migration 29: a demo booking may contain multiple nonconsecutive meetings.
-- Isolation: all test rows are rolled back.
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.as_user(uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub',uid::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;
CREATE FUNCTION pg_temp.reset_user() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub','',true);
END;
$$;

DO $$
DECLARE
  v_instructor uuid := '00000000-0000-0000-0000-0000000000a2';
  v_student uuid := '00000000-0000-0000-0000-0000000000b2';
  v_admin uuid := '00000000-0000-0000-0000-00000000000a';
  v_beach uuid;
  v_start timestamptz;
  v_other timestamptz;
  v_meetings jsonb;
  v_booking uuid;
BEGIN
  SELECT id INTO v_beach FROM public.beaches WHERE slug='prea';
  ASSERT v_beach IS NOT NULL, 'Test beach must exist';
  -- Exactly one week apart; both have the same weekly operating hours.
  v_start:=(((now() AT TIME ZONE 'America/Fortaleza')::date + 51)::timestamp
    + interval '11 hours') AT TIME ZONE 'America/Fortaleza';
  v_other:=v_start + interval '7 days';
  v_meetings:=jsonb_build_array(
    jsonb_build_object('starts_at',to_char(v_other AT TIME ZONE 'America/Fortaleza',
      'YYYY-MM-DD"T"HH24:MI:SS')||'-03:00','hours',2),
    jsonb_build_object('starts_at',to_char(v_start AT TIME ZONE 'America/Fortaleza',
      'YYYY-MM-DD"T"HH24:MI:SS')||'-03:00','hours',2)
  );

  PERFORM pg_temp.as_user(v_student);
  BEGIN
    PERFORM public.create_admin_test_booking(
      v_instructor,v_student,v_beach,v_meetings
    );
    RAISE EXCEPTION 'Student created an admin-only demonstration';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.reset_user();

  PERFORM pg_temp.as_user(v_admin);
  v_booking:=public.create_admin_test_booking(
    v_instructor,v_student,v_beach,v_meetings
  );
  PERFORM pg_temp.reset_user();

  ASSERT EXISTS(
    SELECT 1 FROM public.bookings WHERE id=v_booking
      AND is_test AND status='confirmed'
      AND total_hours=4 AND partner_id IS NULL
      AND code LIKE 'VNT-TEST-%'
  ), 'Multiple classes must share a single test booking';
  ASSERT (
    SELECT count(*) FROM public.booking_meetings
    WHERE booking_id=v_booking AND status='scheduled'
  )=2, 'Must create exactly two scheduled meetings';
  ASSERT EXISTS(
    SELECT 1 FROM public.booking_meetings
    WHERE booking_id=v_booking AND position=1
      AND starts_at=v_start AND minutes=120
  ), 'Meeting positions must be chronological';
  ASSERT EXISTS(
    SELECT 1 FROM public.booking_meetings
    WHERE booking_id=v_booking AND position=2
      AND starts_at=v_other AND minutes=120
  ), 'Second class must remain on the alternate day';
  ASSERT NOT EXISTS(
    SELECT 1 FROM public.test_payment_attempts WHERE booking_id=v_booking
  ), 'Demonstration bookings must never collect payments';

  PERFORM pg_temp.as_user(v_student);
  ASSERT (SELECT count(*) FROM public.bookings WHERE id=v_booking)=1,
    'Student sees the demo reservation';
  ASSERT (SELECT count(*) FROM public.booking_meetings
    WHERE booking_id=v_booking)=2,
    'Student sees both class sessions';
  PERFORM pg_temp.reset_user();

  PERFORM pg_temp.as_user(v_instructor);
  ASSERT (SELECT count(*) FROM public.bookings WHERE id=v_booking)=1,
    'Instructor sees the demo reservation';
  ASSERT (SELECT count(*) FROM public.booking_meetings
    WHERE booking_id=v_booking)=2,
    'Instructor sees both class sessions';
  PERFORM pg_temp.reset_user();

  PERFORM pg_temp.as_user(v_admin);
  -- Existing booking conflict must reject a duplicate booking atomically.
  BEGIN
    PERFORM public.create_admin_test_booking(v_instructor,v_student,v_beach,v_meetings);
    RAISE EXCEPTION 'Double booking should have been rejected';
  EXCEPTION WHEN sqlstate '55000' THEN
    ASSERT SQLERRM='Instructor has a class or block at a selected time',
      'Wrong existing booking conflict';
  END;

  -- A single new request cannot overlap itself even if calendar is empty.
  BEGIN
    PERFORM public.create_admin_test_booking(v_instructor,v_student,v_beach,
      jsonb_build_array(
        jsonb_build_object('starts_at',to_char((v_start+interval '2 days')
          AT TIME ZONE 'America/Fortaleza',
          'YYYY-MM-DD"T"HH24:MI:SS')||'-03:00','hours',2),
        jsonb_build_object('starts_at',to_char((v_start+interval '2 days 1 hour')
          AT TIME ZONE 'America/Fortaleza',
          'YYYY-MM-DD"T"HH24:MI:SS')||'-03:00','hours',2)
      ));
    RAISE EXCEPTION 'Overlapping demo meetings were allowed';
  EXCEPTION WHEN sqlstate '55000' THEN
    ASSERT SQLERRM='Demo meetings cannot overlap each other',
      'Wrong same-booking overlap rule';
  END;

  BEGIN
    PERFORM public.create_admin_test_booking(
      v_instructor,v_student,v_beach,
      jsonb_build_array(
        jsonb_build_object('starts_at',to_char(v_start
          AT TIME ZONE 'America/Fortaleza',
          'YYYY-MM-DD"T"HH24:MI:SS')||'-03:00','hours',5),
        jsonb_build_object('starts_at',to_char(v_other
          AT TIME ZONE 'America/Fortaleza',
          'YYYY-MM-DD"T"HH24:MI:SS')||'-03:00','hours',4)
      )
    );
    RAISE EXCEPTION 'More than eight total hours was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    ASSERT SQLERRM='Maximum 8 hours per demo reservation',
      'Wrong total-hours validation';
  END;

  PERFORM public.cancel_admin_test_lesson(v_booking);
  PERFORM pg_temp.reset_user();
  ASSERT (SELECT status FROM public.bookings WHERE id=v_booking)='cancelled',
    'Admin can cancel a multi-meeting test booking';
  ASSERT (SELECT count(*) FROM public.booking_meetings
    WHERE booking_id=v_booking AND status='cancelled')=2,
    'Cancellation must release every scheduled demo meeting';
END $$;

ROLLBACK;