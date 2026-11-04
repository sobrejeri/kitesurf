-- Correções 34 e 35: execute uma única vez após a migração 33.
BEGIN;

-- Migration 34 | Confirm validation lessons without a checkout, and persist admin drafts.
-- Keeps financial snapshots frozen; validation lessons never count toward payouts.

CREATE FUNCTION public.confirm_validation_lesson(p_booking_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=public.require_role(ARRAY['student']::public.app_role[]);
  b public.bookings;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id=p_booking_id FOR UPDATE;
  IF b.id IS NULL OR b.student_id<>uid THEN
    RAISE EXCEPTION 'Booking not found' USING errcode='P0002';
  END IF;
  IF b.status='confirmed' AND b.is_test THEN RETURN; END IF;
  IF b.status<>'awaiting_payment' OR b.instructor_id IS NULL
    OR b.created_at<now()-interval '10 minutes' THEN
    RAISE EXCEPTION 'Validation confirmation unavailable or expired' USING errcode='55000';
  END IF;
  UPDATE public.bookings SET is_test=true,status='confirmed',confirmed_at=now() WHERE id=b.id;
  UPDATE public.instructors SET queue_position=nextval('public.instructor_queue_seq') WHERE id=b.instructor_id;
  PERFORM public.write_audit('booking.validation_confirmed','booking',b.id::text,
    jsonb_build_object('status',b.status,'is_test',b.is_test),
    jsonb_build_object('status','confirmed','is_test',true),
    'Validation without checkout, charge, commission or payout');
END $$;
REVOKE ALL ON FUNCTION public.confirm_validation_lesson(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_validation_lesson(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.partner_summary()
RETURNS TABLE(bookings integer,pending_cents bigint,released_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=public.require_role(ARRAY['partner']::public.app_role[]);
BEGIN
  RETURN QUERY SELECT count(*)::integer,
    coalesce(sum(b.partner_cents) FILTER(WHERE b.status IN ('awaiting_payment','confirmed')),0),
    coalesce(sum(b.partner_cents) FILTER(WHERE b.status='completed'),0)
  FROM public.bookings b JOIN public.partners p ON p.id=b.partner_id
  WHERE p.owner_id=uid AND NOT b.is_test AND b.status<>'cancelled';
END $$;

CREATE OR REPLACE FUNCTION public.notify_confirmed_booking() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.status='confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
    IF NEW.instructor_id IS NOT NULL THEN
      INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
      VALUES(NEW.instructor_id,'booking','Aula confirmada',
        CASE WHEN NEW.is_test THEN 'Aula de validação sem cobrança. Confira sua agenda.'
          ELSE 'A reserva foi confirmada. Confira sua agenda.' END,'/instrutor/agenda');
    END IF;
    INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
    VALUES(NEW.student_id,'booking','Aula confirmada',
      CASE WHEN NEW.is_test THEN 'Validação confirmada sem cobrança. Confira sua reserva.'
        ELSE 'Confira sua reserva e as próximas instruções.' END,
      '/aluno/reserva/'||NEW.id::text);
  END IF;
  RETURN NEW;
END $$;

CREATE TABLE public.commercial_policy_drafts (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  cancellation_hours integer NOT NULL CHECK(cancellation_hours BETWEEN 0 AND 720),
  late_cancellation text NOT NULL DEFAULT '' CHECK(length(late_cancellation)<=5000),
  absence text NOT NULL DEFAULT '' CHECK(length(absence)<=5000),
  weather text NOT NULL DEFAULT '' CHECK(length(weather)<=5000),
  updated_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.commercial_policy_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_policy_drafts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.commercial_policy_drafts TO authenticated;
CREATE POLICY commercial_drafts_admin_read ON public.commercial_policy_drafts
  FOR SELECT TO authenticated USING(public.is_admin());

CREATE FUNCTION public.save_commercial_policy_draft(
  p_cancellation_hours integer,p_late_cancellation text,p_absence text,p_weather text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=public.require_role(ARRAY['admin']::public.app_role[]);
BEGIN
  IF p_cancellation_hours IS NULL OR p_cancellation_hours NOT BETWEEN 0 AND 720
    OR p_late_cancellation IS NULL OR length(p_late_cancellation)>5000
    OR p_absence IS NULL OR length(p_absence)>5000
    OR p_weather IS NULL OR length(p_weather)>5000 THEN
    RAISE EXCEPTION 'Invalid commercial policy draft' USING errcode='22023';
  END IF;
  INSERT INTO public.commercial_policy_drafts(singleton,cancellation_hours,late_cancellation,absence,weather,updated_by)
  VALUES(true,p_cancellation_hours,trim(p_late_cancellation),trim(p_absence),trim(p_weather),uid)
  ON CONFLICT(singleton) DO UPDATE SET cancellation_hours=excluded.cancellation_hours,
    late_cancellation=excluded.late_cancellation,absence=excluded.absence,
    weather=excluded.weather,updated_by=uid,updated_at=now();
  PERFORM public.write_audit('policy.draft_saved','commercial_policy','current',null,
    jsonb_build_object('cancellation_hours',p_cancellation_hours),
    'Saved draft only; no change to live cancellation rules or fees');
END $$;
REVOKE ALL ON FUNCTION public.save_commercial_policy_draft(integer,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_commercial_policy_draft(integer,text,text,text) TO authenticated;

NOTIFY pgrst,'reload schema';

-- Migration 35 | Restore the scheduling guard and release expired confirmation holds.
-- Existing bookings and searching instructor requests both reserve the student's time.
-- Installs safely even when migration 32 was omitted in the live SQL editor.

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
