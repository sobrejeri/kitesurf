-- Migration 35 | Restore the scheduling guard and release expired confirmation holds.
-- Existing bookings and searching instructor requests both reserve the student's time.
-- Installs safely even when migration 32 was omitted in the live SQL editor.
BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_student_request_schedule()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $student_schedule_guard$
DECLARE
  slot jsonb;
  proposed_start timestamptz;
  proposed_end timestamptz;
BEGIN
  IF NEW.status <> 'searching' THEN RETURN NEW; END IF;

  -- A transaction-scoped per-student lock closes the simultaneous-request race.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.student_id::text, 32026)
  );
  -- Expired confirmation windows must not block the student indefinitely.
  UPDATE public.bookings SET status='cancelled',cancelled_at=pg_catalog.now()
    WHERE student_id=NEW.student_id AND status='awaiting_payment'
      AND created_at<pg_catalog.now()-interval '10 minutes';

  FOR slot IN SELECT value FROM pg_catalog.jsonb_array_elements(NEW.meetings) LOOP
    proposed_start := (slot->>'starts_at')::timestamptz;
    proposed_end := proposed_start
      + pg_catalog.make_interval(hours => (slot->>'hours')::integer);

    IF EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.booking_meetings bm ON bm.booking_id = b.id
      WHERE b.student_id = NEW.student_id
        AND (b.status='confirmed' OR (b.status='awaiting_payment'
          AND b.created_at>=pg_catalog.now()-interval '10 minutes'))
        AND bm.status IN ('scheduled', 'in_progress')
        AND pg_catalog.tstzrange(bm.starts_at,
              bm.starts_at + pg_catalog.make_interval(mins => bm.minutes), '[)')
          && pg_catalog.tstzrange(proposed_start, proposed_end, '[)')
    ) OR EXISTS (
      SELECT 1 FROM public.instructor_requests r
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(r.meetings) AS existing(slot)
      WHERE r.student_id = NEW.student_id
        AND r.id IS DISTINCT FROM NEW.id
        AND r.status = 'searching'
        AND r.expires_at > pg_catalog.now()
        AND pg_catalog.tstzrange(
              (existing.slot->>'starts_at')::timestamptz,
              (existing.slot->>'starts_at')::timestamptz
                + pg_catalog.make_interval(hours => (existing.slot->>'hours')::integer), '[)')
          && pg_catalog.tstzrange(proposed_start, proposed_end, '[)')
    ) THEN
      RAISE EXCEPTION 'Student already has a lesson at the selected time'
        USING ERRCODE = '23505',
              HINT = 'STUDENT_SCHEDULE_CONFLICT';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$student_schedule_guard$;

REVOKE ALL ON FUNCTION public.enforce_student_request_schedule()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS instructor_request_student_schedule_guard ON public.instructor_requests;
CREATE TRIGGER instructor_request_student_schedule_guard
  BEFORE INSERT OR UPDATE OF meetings, status
  ON public.instructor_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_student_request_schedule();

COMMIT;
