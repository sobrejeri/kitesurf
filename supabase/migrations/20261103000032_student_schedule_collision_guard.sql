-- Migration 32 | Prevent an individual student from occupying the same time slot twice.
-- Uses transaction-scoped advisory locks so concurrent booking requests for one
-- student cannot both pass an "empty schedule" check.
BEGIN;

CREATE FUNCTION public.guard_student_request_slots()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $guard_student_request$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('vento_student_' || NEW.student_id::text, 0)
  );

  IF EXISTS (
    SELECT 1
      FROM public.bookings b
      JOIN public.booking_meetings bm ON bm.booking_id=b.id
      CROSS JOIN LATERAL jsonb_array_elements(NEW.meetings) wanted(slot)
     WHERE b.student_id=NEW.student_id
       AND b.status IN ('confirmed','awaiting_payment')
       AND bm.status IN ('scheduled','in_progress')
       AND pg_catalog.tstzrange(
         bm.starts_at, bm.starts_at+bm.minutes*interval '1 minute','[)'
       ) && pg_catalog.tstzrange(
         (wanted.slot->>'starts_at')::timestamptz,
         (wanted.slot->>'starts_at')::timestamptz
           +(wanted.slot->>'hours')::integer*interval '1 hour','[)'
       )
  ) THEN
    RAISE EXCEPTION 'Student already has an active meeting at this time'
      USING ERRCODE='22023';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.instructor_requests existing
      CROSS JOIN LATERAL jsonb_array_elements(existing.meetings) old_slot(slot)
      CROSS JOIN LATERAL jsonb_array_elements(NEW.meetings) wanted(slot)
     WHERE existing.student_id=NEW.student_id
       AND existing.status='searching'
       AND existing.expires_at>now()
       AND pg_catalog.tstzrange(
         (old_slot.slot->>'starts_at')::timestamptz,
         (old_slot.slot->>'starts_at')::timestamptz
           +(old_slot.slot->>'hours')::integer*interval '1 hour','[)'
       ) && pg_catalog.tstzrange(
         (wanted.slot->>'starts_at')::timestamptz,
         (wanted.slot->>'starts_at')::timestamptz
           +(wanted.slot->>'hours')::integer*interval '1 hour','[)'
       )
  ) THEN
    RAISE EXCEPTION 'Student already has a pending request at this time'
      USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END;
$guard_student_request$;

CREATE TRIGGER guard_student_request_slots_insert
  BEFORE INSERT ON public.instructor_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_student_request_slots();

CREATE FUNCTION public.guard_student_booking_meetings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $guard_student_meeting$
DECLARE
  v_student uuid;
  v_booking_status public.booking_status;
BEGIN
  SELECT b.student_id,b.status INTO v_student,v_booking_status
  FROM public.bookings b WHERE b.id=NEW.booking_id;

  IF v_student IS NULL
    OR v_booking_status NOT IN ('awaiting_payment','confirmed')
    OR NEW.status NOT IN ('scheduled','in_progress') THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('vento_student_' || v_student::text, 0)
  );

  IF EXISTS (
    SELECT 1
      FROM public.booking_meetings bm
      JOIN public.bookings b ON b.id=bm.booking_id
     WHERE b.student_id=v_student
       AND b.status IN ('confirmed','awaiting_payment')
       AND bm.status IN ('scheduled','in_progress')
       AND bm.id<>NEW.id
       AND pg_catalog.tstzrange(
         bm.starts_at,bm.starts_at+bm.minutes*interval '1 minute','[)'
       ) && pg_catalog.tstzrange(
         NEW.starts_at,NEW.starts_at+NEW.minutes*interval '1 minute','[)'
       )
  ) THEN
    RAISE EXCEPTION 'Student already has an active meeting at this time'
      USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END;
$guard_student_meeting$;

CREATE TRIGGER guard_student_booking_meeting_write
  BEFORE INSERT OR UPDATE OF starts_at, minutes, status
  ON public.booking_meetings
  FOR EACH ROW EXECUTE FUNCTION public.guard_student_booking_meetings();

REVOKE ALL ON FUNCTION public.guard_student_request_slots() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_student_booking_meetings() FROM PUBLIC, anon, authenticated;

COMMIT;
