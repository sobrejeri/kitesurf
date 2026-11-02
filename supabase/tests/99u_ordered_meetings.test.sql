-- Start next encounter only on the Ceará date and in booking sequence.
-- All fixture changes are rolled back.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  lesson public.booking_meetings;
  next_lesson public.booking_meetings;
  reservation public.bookings;
BEGIN
  SELECT m.* INTO lesson FROM public.booking_meetings m
  JOIN public.bookings b ON b.id=m.booking_id
  WHERE b.instructor_id IS NOT NULL AND b.status IN ('confirmed','completed')
    AND m.position=1
  LIMIT 1;
  ASSERT lesson.id IS NOT NULL, 'First lesson fixture required';
  SELECT * INTO reservation FROM public.bookings WHERE id=lesson.booking_id;

  UPDATE public.bookings SET status='confirmed' WHERE id=reservation.id;
  UPDATE public.booking_meetings
    SET status='scheduled', starts_at=now()+interval '2 days'
    WHERE id=lesson.id;

  PERFORM set_config('request.jwt.claim.sub',reservation.instructor_id::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.start_ordered_meeting(lesson.id,reservation.presence_code);
    RAISE EXCEPTION 'Future encounter started ahead of date';
  EXCEPTION WHEN sqlstate '55000' THEN
    ASSERT SQLERRM='Meeting day has not arrived', 'Wrong future-day error';
  END;

  EXECUTE 'RESET ROLE';
  UPDATE public.booking_meetings SET starts_at=now()-interval '30 minutes'
    WHERE id=lesson.id;
  PERFORM set_config('request.jwt.claim.sub',reservation.instructor_id::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.start_ordered_meeting(lesson.id,reservation.presence_code);
  ASSERT (SELECT status FROM public.booking_meetings WHERE id=lesson.id)='in_progress',
    'Encounter was not started on its own day';

  -- If a second encounter exists it remains blocked until the first is closed.
  EXECUTE 'RESET ROLE';
  SELECT * INTO next_lesson FROM public.booking_meetings
    WHERE booking_id=lesson.booking_id AND position=2;
  IF next_lesson.id IS NOT NULL THEN
    UPDATE public.booking_meetings
      SET status='scheduled', starts_at=now()-interval '15 minutes'
      WHERE id=next_lesson.id;
    PERFORM set_config('request.jwt.claim.sub',reservation.instructor_id::text,true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      PERFORM public.start_ordered_meeting(next_lesson.id,reservation.presence_code);
      RAISE EXCEPTION 'Later encounter started before prior lesson finished';
    EXCEPTION WHEN sqlstate '55000' THEN
      ASSERT SQLERRM='Finish the previous meeting first',
        'Wrong encounter order error';
    END;
  END IF;
  EXECUTE 'RESET ROLE';
END $$;

ROLLBACK;
