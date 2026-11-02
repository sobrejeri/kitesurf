-- Migration 31: 72h notice, 12h peer response + 12h student choice.
-- Does not charge again; previously completed classes are retained.
-- Run after Migration 30; this replaces its 48-hour auto-cancel behavior.
BEGIN;

ALTER TABLE public.meeting_change_requests
  ADD COLUMN kind text NOT NULL DEFAULT 'reschedule'
    CHECK(kind IN ('reschedule','cancel')),
  ADD COLUMN choice_until timestamptz;
ALTER TABLE public.meeting_change_requests
  ALTER COLUMN proposed_starts_at DROP NOT NULL;
ALTER TABLE public.meeting_change_requests
  DROP CONSTRAINT change_schedule_distinct,
  DROP CONSTRAINT meeting_change_requests_status_check;
ALTER TABLE public.meeting_change_requests
  ADD CONSTRAINT change_schedule_distinct CHECK(
    (kind='cancel' AND proposed_starts_at IS NULL)
    OR (kind='reschedule' AND proposed_starts_at>original_starts_at)
  ),
  ADD CONSTRAINT meeting_change_requests_status_check CHECK(
    status IN ('pending','accepted','rejected','expired','action_required',
               'cancelled_by_student','sent_to_queue')
  );
CREATE UNIQUE INDEX IF NOT EXISTS meeting_change_one_action_per_booking
  ON public.meeting_change_requests(booking_id) WHERE status='action_required';

ALTER TABLE public.bookings
  ADD COLUMN reassignment_pending boolean NOT NULL DEFAULT false;
ALTER TABLE public.booking_meetings
  ADD COLUMN taught_by_instructor_id uuid REFERENCES public.instructors(id);
UPDATE public.booking_meetings m SET taught_by_instructor_id=b.instructor_id
  FROM public.bookings b
  WHERE m.booking_id=b.id AND m.status IN('done','in_progress')
    AND m.taught_by_instructor_id IS NULL;
CREATE INDEX booking_meetings_taught_by_idx ON public.booking_meetings(taught_by_instructor_id)
 WHERE taught_by_instructor_id IS NOT NULL;

-- Original requests remain accepted and linked to their booking. A new
-- queue attempt reuses the same paid booking rather than creating another.
ALTER TABLE public.instructor_requests
 DROP CONSTRAINT IF EXISTS instructor_requests_booking_id_key;
CREATE UNIQUE INDEX instructor_one_active_reassignment
 ON public.instructor_requests(booking_id)
 WHERE booking_id IS NOT NULL AND status='searching';

-- Internal helper: must only be called after acquiring booking FOR UPDATE.
CREATE FUNCTION public.requeue_confirmed_booking(
 p_booking_id uuid, p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 b public.bookings;
 v_meetings jsonb;
 v_hours integer;
 v_old_instructor uuid;
 v_id uuid;
BEGIN
 SELECT * INTO b FROM public.bookings WHERE id=p_booking_id FOR UPDATE;
 IF b.id IS NULL OR b.status<>'confirmed' OR b.reassignment_pending THEN
   RAISE EXCEPTION 'Booking cannot be reassigned now' USING errcode='55000';
 END IF;
 IF EXISTS(SELECT 1 FROM public.booking_meetings
   WHERE booking_id=b.id AND status='in_progress') THEN
   RAISE EXCEPTION 'Finish ongoing lesson before changing instructor'
   USING errcode='55000'; END IF;
 IF EXISTS(SELECT 1 FROM public.instructor_requests
   WHERE booking_id=b.id AND status='searching') THEN
   RAISE EXCEPTION 'Instructor search already started' USING errcode='55000'; END IF;
 SELECT jsonb_agg(jsonb_build_object('starts_at',m.starts_at,'hours',m.minutes/60)
   ORDER BY m.position),coalesce(sum(m.minutes/60),0)::integer
 INTO v_meetings,v_hours
 FROM public.booking_meetings m
 WHERE m.booking_id=b.id AND m.status='scheduled';
 IF v_meetings IS NULL OR v_hours<1 THEN
   RAISE EXCEPTION 'No future meetings to reassign' USING errcode='55000';
 END IF;
 v_old_instructor:=b.instructor_id;
 UPDATE public.booking_meetings m
    SET taught_by_instructor_id=coalesce(m.taught_by_instructor_id,v_old_instructor)
 WHERE m.booking_id=b.id AND m.status IN('done','in_progress')
   AND m.taught_by_instructor_id IS NULL;
 UPDATE public.bookings
   SET instructor_id=NULL,reassignment_pending=true
   WHERE id=b.id;
 INSERT INTO public.instructor_requests(
    student_id,beach_id,level,language,meetings,total_hours,
    with_transport,price_version_id,status,booking_id,expires_at
 ) VALUES(
    b.student_id,b.beach_id,b.level,b.language,v_meetings,v_hours,
    b.with_transport,b.price_version_id,'searching',b.id,now()+interval '12 hours'
 ) RETURNING id INTO v_id;
 -- No offer to an instructor who has just withdrawn.
 IF v_old_instructor IS NOT NULL THEN
   INSERT INTO public.instructor_offers(
     request_id,instructor_id,status,expires_at,responded_at
   ) VALUES(v_id,v_old_instructor,'declined',now(),now());
 END IF;
 PERFORM public.advance_instructor_offer(v_id);
 INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
 VALUES(b.student_id,'booking','Procurando novo instrutor',
   'Sua reserva foi mantida. Estamos consultando os próximos profissionais da fila, sem nova cobrança.',
   '/aluno/reserva/'||b.id::text);
 PERFORM public.write_audit('booking.instructor_requeue','booking',b.id::text,
   jsonb_build_object('instructor',v_old_instructor),
   jsonb_build_object('request_id',v_id,'instructor',NULL),p_reason);
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.requeue_confirmed_booking(uuid,text)
 FROM PUBLIC,anon,authenticated;

-- New SQL version of acceptance only for offers linked to an existing booking:
-- the legacy function is replaced below by an injected branch.
