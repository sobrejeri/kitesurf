-- Booking-level assessment must be once-per-booking, viewable only by
-- relevant participants. Test transactions never persist fixture mutations.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_booking public.bookings;
  v_meeting public.booking_meetings;
  v_other uuid := '00000000-0000-0000-0000-0000000000b6';
BEGIN
  SELECT b.* INTO v_booking FROM public.bookings b
    WHERE b.instructor_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.booking_meetings m WHERE m.booking_id=b.id)
    LIMIT 1;
  ASSERT v_booking.id IS NOT NULL, 'Requires a booking with instructor and meeting';
  SELECT m.* INTO v_meeting FROM public.booking_meetings m
    WHERE m.booking_id=v_booking.id ORDER BY m.position DESC LIMIT 1;

  INSERT INTO auth.users(id,email,raw_user_meta_data)
  VALUES(v_other,'unrelated-review-test@example.invalid',
    '{"role":"student","full_name":"Sem reserva"}'::jsonb);

  UPDATE public.bookings SET status='confirmed' WHERE id=v_booking.id;
  UPDATE public.booking_meetings SET status='scheduled'
    WHERE booking_id=v_booking.id;
  UPDATE public.booking_meetings SET status='done'
    WHERE id=v_meeting.id;

  PERFORM set_config('request.jwt.claim.sub', v_booking.instructor_id::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF (SELECT count(*) FROM public.booking_meetings
      WHERE booking_id=v_booking.id) > 1 THEN
    BEGIN
      PERFORM public.assess_student_kite_level(v_meeting.id,'returning');
      RAISE EXCEPTION 'Assessment allowed while another meeting is unfinished';
    EXCEPTION WHEN sqlstate '55000' THEN
      ASSERT SQLERRM='Complete all planned meetings before evaluating',
        'Wrong premature assessment validation';
    END;
  END IF;
  EXECUTE 'RESET ROLE';

  UPDATE public.booking_meetings SET status='done'
    WHERE booking_id=v_booking.id;
  UPDATE public.bookings SET status='completed' WHERE id=v_booking.id;

  PERFORM set_config('request.jwt.claim.sub',v_booking.instructor_id::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.assess_student_kite_level(v_meeting.id,'returning');
  ASSERT (SELECT count(*) FROM public.booking_level_assessments
    WHERE booking_id=v_booking.id) = 1, 'One booking must have exactly one review';
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claim.sub',v_booking.student_id::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ASSERT (SELECT count(*) FROM public.booking_level_assessments
    WHERE booking_id=v_booking.id)=1, 'Student cannot see own booking evaluation';
  BEGIN
    UPDATE public.booking_level_assessments SET assessed_level='improving'
      WHERE booking_id=v_booking.id;
    RAISE EXCEPTION 'Student modified instructor assessment';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claim.sub',v_other::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ASSERT (SELECT count(*) FROM public.booking_level_assessments
    WHERE booking_id=v_booking.id)=0, 'Unrelated student sees private assessment';
  BEGIN
    PERFORM public.assess_student_kite_level(v_meeting.id,'improving');
    RAISE EXCEPTION 'Unrelated student can submit assessment';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';

  ASSERT NOT has_table_privilege('anon','public.booking_level_assessments','SELECT'),
    'Anonymous can read level assessments';
  ASSERT NOT has_table_privilege('authenticated','public.booking_level_assessments','UPDATE'),
    'Authenticated can modify assessment table directly';
END $$;

ROLLBACK;