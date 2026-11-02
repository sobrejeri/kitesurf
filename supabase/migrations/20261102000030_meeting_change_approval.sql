-- Migration 30 | Meeting rescheduling by student/instructor mutual consent
-- Deadline: 72h before original meeting; reply: 48h; timed out bookings are
-- cancelled (remaining meetings only), with financial reconciliation required.
BEGIN;

CREATE TABLE public.meeting_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL REFERENCES public.booking_meetings(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES public.profiles(id),
  responder_id uuid NOT NULL REFERENCES public.profiles(id),
  original_starts_at timestamptz NOT NULL,
  proposed_starts_at timestamptz NOT NULL,
  reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 8 AND 500),
  status text NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','accepted','rejected','expired')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  responded_at timestamptz,
  CONSTRAINT change_schedule_distinct CHECK(original_starts_at <> proposed_starts_at),
  CONSTRAINT change_responders_differ CHECK(requester_id <> responder_id)
);
CREATE UNIQUE INDEX meeting_change_one_pending_per_booking
  ON public.meeting_change_requests(booking_id) WHERE status='pending';
CREATE INDEX meeting_change_due ON public.meeting_change_requests(expires_at)
  WHERE status='pending';
CREATE INDEX meeting_change_participants ON public.meeting_change_requests(requester_id,responder_id);

ALTER TABLE public.meeting_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meeting_change_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.meeting_change_requests TO authenticated;
CREATE POLICY meeting_change_participants_read ON public.meeting_change_requests
 FOR SELECT TO authenticated USING(
  requester_id=auth.uid() OR responder_id=auth.uid() OR public.is_admin()
 );

-- This check ignores the meeting that is being rescheduled. Calling
-- instructor_can_attend directly here would reject its own old reservation.
CREATE FUNCTION public.can_move_meeting(
  p_instructor uuid, p_meeting uuid, p_start timestamptz, p_minutes integer
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_end timestamptz:=p_start+make_interval(mins=>p_minutes);
  v_start_local timestamp:=p_start AT TIME ZONE 'America/Fortaleza';
  v_end_local timestamp:=v_end AT TIME ZONE 'America/Fortaleza';
  v_buffer integer:=0;
  v_configured boolean;
BEGIN
  SELECT buffer_minutes INTO v_buffer
    FROM public.instructor_schedule_settings WHERE instructor_id=p_instructor;
  v_configured:=found;
  v_buffer:=coalesce(v_buffer,0);
  IF v_configured AND NOT EXISTS (
    SELECT 1 FROM public.instructor_weekly_hours h
    WHERE h.instructor_id=p_instructor
      AND h.weekday=extract(dow FROM v_start_local)::integer
      AND v_start_local::date=v_end_local::date
      AND v_start_local::time>=h.opens_at AND v_end_local::time<=h.closes_at
  ) THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM public.instructor_time_off t
    WHERE t.instructor_id=p_instructor AND
      tstzrange(t.starts_at,t.ends_at,'[)') && tstzrange(p_start,v_end,'[)')
  ) THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM public.booking_meetings m
    JOIN public.bookings b ON b.id=m.booking_id
    WHERE b.instructor_id=p_instructor AND m.id<>p_meeting
      AND m.status<>'cancelled' AND
      (b.status='confirmed' OR (b.status='awaiting_payment'
        AND b.created_at>=now()-interval '10 minutes'))
      AND tstzrange(
        m.starts_at-make_interval(mins=>v_buffer),
        m.starts_at+make_interval(mins=>m.minutes+v_buffer),'[)'
      ) && tstzrange(p_start,v_end,'[)')
  ) THEN RETURN false; END IF;
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.can_move_meeting(uuid,uuid,timestamptz,integer)
 FROM PUBLIC,anon,authenticated;

-- Keep reads scoped to one of the booking parties. No direct table writes.
CREATE FUNCTION public.request_meeting_change(
  p_meeting_id uuid, p_new_start timestamptz, p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_user uuid:=public.require_role(ARRAY['student','instructor']::public.app_role[]);
  v_booking public.bookings;
  v_meeting public.booking_meetings;
  v_responder uuid;
  v_request_id uuid;
BEGIN
  -- Take the same instructor lock as booking creation to serialize calendar changes.
  SELECT b.* INTO v_booking
    FROM public.bookings b JOIN public.booking_meetings m ON m.booking_id=b.id
    WHERE m.id=p_meeting_id;
  IF v_booking.id IS NULL OR v_booking.status<>'confirmed'
    OR v_booking.instructor_id IS NULL
    OR v_user NOT IN (v_booking.student_id,v_booking.instructor_id)
  THEN RAISE EXCEPTION 'Confirmed meeting of this user not found'
    USING errcode='42501'; END IF;
  PERFORM 1 FROM public.instructors WHERE id=v_booking.instructor_id FOR UPDATE;
  SELECT * INTO v_booking FROM public.bookings WHERE id=v_booking.id FOR UPDATE;
  SELECT * INTO v_meeting FROM public.booking_meetings
    WHERE id=p_meeting_id AND booking_id=v_booking.id FOR UPDATE;
  IF v_booking.status<>'confirmed' OR v_meeting.status<>'scheduled' THEN
    RAISE EXCEPTION 'Only scheduled confirmed meetings may be changed'
      USING errcode='55000'; END IF;
  IF now()>v_meeting.starts_at-interval '72 hours' THEN
    RAISE EXCEPTION 'Meeting change must be requested 72 hours before'
      USING errcode='22023'; END IF;
  IF p_new_start IS NULL OR p_new_start<now()+interval '72 hours'
    OR p_new_start>now()+interval '90 days'
    OR p_new_start=v_meeting.starts_at
  THEN RAISE EXCEPTION 'Propose a new date at least 72 hours away'
    USING errcode='22023'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 8 AND 500 THEN
    RAISE EXCEPTION 'Change reason must have 8 to 500 characters'
      USING errcode='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.meeting_change_requests
            WHERE booking_id=v_booking.id AND status='pending') THEN
    RAISE EXCEPTION 'Another change request is waiting for approval'
      USING errcode='55000'; END IF;
  -- Preserve the chronological order of the original multi-day booking.
  IF EXISTS (
    SELECT 1 FROM public.booking_meetings m
    WHERE m.booking_id=v_booking.id AND m.id<>v_meeting.id
      AND (m.position<v_meeting.position AND
        m.starts_at+make_interval(mins=>m.minutes)>p_new_start
        OR m.position>v_meeting.position AND
        m.starts_at<p_new_start+make_interval(mins=>v_meeting.minutes))
  ) THEN RAISE EXCEPTION 'New meeting time changes booking order'
      USING errcode='55000'; END IF;
  IF NOT public.can_move_meeting(
    v_booking.instructor_id,v_meeting.id,p_new_start,v_meeting.minutes
  ) THEN RAISE EXCEPTION 'Instructor unavailable for proposed meeting'
    USING errcode='55000'; END IF;
  v_responder:=CASE WHEN v_user=v_booking.student_id
    THEN v_booking.instructor_id ELSE v_booking.student_id END;
  INSERT INTO public.meeting_change_requests(
    booking_id,meeting_id,requester_id,responder_id,
    original_starts_at,proposed_starts_at,reason
  ) VALUES(
    v_booking.id,v_meeting.id,v_user,v_responder,
    v_meeting.starts_at,p_new_start,trim(p_reason)
  ) RETURNING id INTO v_request_id;
  INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
   VALUES(v_responder,'booking','Pedido de alteração de aula',
     'Você tem 48 horas para aceitar ou recusar a nova data. Sem resposta, a reserva será cancelada.',
     CASE WHEN v_responder=v_booking.student_id
      THEN '/aluno/reserva/'||v_booking.id::text ELSE '/instrutor/aula?aba=proximas&aula='||v_meeting.id::text END);
  PERFORM public.write_audit('meeting.change_requested','booking_meeting',v_meeting.id::text,
    jsonb_build_object('starts_at',v_meeting.starts_at),
    jsonb_build_object('proposed_starts_at',p_new_start,'deadline',now()+interval '48 hours'),
    trim(p_reason));
  RETURN v_request_id;
END $$;

CREATE FUNCTION public.respond_meeting_change(
  p_request_id uuid, p_accept boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_user uuid:=public.require_role(ARRAY['student','instructor']::public.app_role[]);
  v_change public.meeting_change_requests;
  v_booking public.bookings;
  v_meeting public.booking_meetings;
BEGIN
  SELECT * INTO v_change FROM public.meeting_change_requests WHERE id=p_request_id;
  IF v_change.id IS NULL OR v_change.responder_id<>v_user THEN
    RAISE EXCEPTION 'Meeting change not found for this user' USING errcode='42501';
  END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id=v_change.booking_id;
  PERFORM 1 FROM public.instructors WHERE id=v_booking.instructor_id FOR UPDATE;
  SELECT * INTO v_booking FROM public.bookings WHERE id=v_change.booking_id FOR UPDATE;
  SELECT * INTO v_change FROM public.meeting_change_requests WHERE id=p_request_id FOR UPDATE;
  SELECT * INTO v_meeting FROM public.booking_meetings WHERE id=v_change.meeting_id FOR UPDATE;
  IF v_change.status<>'pending' THEN
    RAISE EXCEPTION 'Meeting change already decided' USING errcode='55000';
  END IF;
  IF now()>=v_change.expires_at THEN
    RAISE EXCEPTION 'Meeting change response deadline expired' USING errcode='55000';
  END IF;
  IF v_booking.status<>'confirmed' OR v_meeting.status<>'scheduled'
    OR v_meeting.starts_at<>v_change.original_starts_at THEN
    RAISE EXCEPTION 'Meeting no longer eligible for change' USING errcode='55000';
  END IF;
  IF p_accept IS NULL THEN RAISE EXCEPTION 'Choose accept or reject'
      USING errcode='22023'; END IF;
  IF p_accept THEN
    IF v_change.proposed_starts_at<now()+interval '24 hours'
      OR NOT public.can_move_meeting(
        v_booking.instructor_id,v_meeting.id,v_change.proposed_starts_at,v_meeting.minutes)
      OR EXISTS (
        SELECT 1 FROM public.booking_meetings m
        WHERE m.booking_id=v_booking.id AND m.id<>v_meeting.id
        AND (m.position<v_meeting.position
          AND m.starts_at+make_interval(mins=>m.minutes)>v_change.proposed_starts_at
          OR m.position>v_meeting.position
          AND m.starts_at<v_change.proposed_starts_at+make_interval(mins=>v_meeting.minutes))
      )
    THEN RAISE EXCEPTION 'Proposed time is no longer available'
      USING errcode='55000'; END IF;
    UPDATE public.booking_meetings SET starts_at=v_change.proposed_starts_at
      WHERE id=v_meeting.id;
  END IF;
  UPDATE public.meeting_change_requests
   SET status=CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
       responded_at=now()
   WHERE id=v_change.id;
  INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
  VALUES(v_change.requester_id,'booking',
    CASE WHEN p_accept THEN 'Nova data aprovada' ELSE 'Alteração de data recusada' END,
    CASE WHEN p_accept THEN 'O encontro foi reagendado com a aprovação da outra pessoa.'
      ELSE 'A alteração foi recusada. O horário original permanece confirmado.' END,
    CASE WHEN v_change.requester_id=v_booking.student_id
      THEN '/aluno/reserva/'||v_booking.id::text
      ELSE '/instrutor/aula?aba=proximas&aula='||v_meeting.id::text END);
  PERFORM public.write_audit('meeting.change_responded','booking_meeting',v_meeting.id::text,
    jsonb_build_object('original_starts_at',v_change.original_starts_at),
    jsonb_build_object('proposed_starts_at',v_change.proposed_starts_at,'accepted',p_accept),
    NULL);
END $$;

-- Called by Supabase pg_cron every five minutes (service-side, not user-driven).
-- Cancellation affects unfinished meetings; completed history is never deleted.
CREATE FUNCTION public.expire_meeting_change_requests()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_booking public.bookings;
  v_change public.meeting_change_requests;
  v_count integer:=0;
BEGIN
  FOR v_booking IN
    SELECT b.* FROM public.bookings b
    WHERE b.status='confirmed' AND EXISTS(
      SELECT 1 FROM public.meeting_change_requests r
       WHERE r.booking_id=b.id AND r.status='pending' AND r.expires_at<=now()
    )
    FOR UPDATE OF b SKIP LOCKED
  LOOP
    SELECT * INTO v_change FROM public.meeting_change_requests
      WHERE booking_id=v_booking.id AND status='pending' AND expires_at<=now()
      FOR UPDATE;
    IF v_change.id IS NULL THEN CONTINUE; END IF;
    UPDATE public.meeting_change_requests SET status='expired',responded_at=now()
     WHERE id=v_change.id;
    IF NOT EXISTS(SELECT 1 FROM public.booking_meetings
      WHERE booking_id=v_booking.id AND status='in_progress') THEN
      UPDATE public.booking_meetings SET status='cancelled'
        WHERE booking_id=v_booking.id AND status='scheduled';
      UPDATE public.bookings SET status='cancelled',cancelled_at=now()
        WHERE id=v_booking.id;
    END IF;
    INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
    SELECT party,'booking','Prazo de reagendamento encerrado',
      CASE WHEN EXISTS(SELECT 1 FROM public.booking_meetings
         WHERE booking_id=v_booking.id AND status='in_progress')
        THEN 'Pedido expirou com uma aula em andamento. A administração precisa analisar.'
        ELSE 'A reserva foi cancelada por falta de resposta em 48 horas. Consulte o suporte sobre valores pagos.' END,
      CASE WHEN party=v_booking.student_id THEN '/aluno/reserva/'||v_booking.id::text
        ELSE '/instrutor/agenda' END
    FROM unnest(ARRAY[v_booking.student_id,v_booking.instructor_id]) AS party;
    PERFORM public.write_audit('booking.change_expired','booking',v_booking.id::text,
      jsonb_build_object('status','confirmed','request_id',v_change.id),
      jsonb_build_object('status',CASE WHEN EXISTS(SELECT 1 FROM public.booking_meetings
        WHERE booking_id=v_booking.id AND status='in_progress') THEN 'confirmed'
        ELSE 'cancelled' END),
      'Sem resposta em 48h. Revisar eventual reembolso antes do repasse.');
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.request_meeting_change(uuid,timestamptz,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.respond_meeting_change(uuid,boolean)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.expire_meeting_change_requests()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_meeting_change(uuid,timestamptz,text),
 public.respond_meeting_change(uuid,boolean) TO authenticated;

-- Only schedule automatically if pg_cron is already enabled. See SQL below
-- for activation; local isolated CI PostgreSQL typically has no pg_cron.
DO $$
DECLARE v_schema text;
BEGIN
  SELECT n.nspname INTO v_schema FROM pg_extension e
   JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pg_cron';
  IF v_schema IS NOT NULL THEN
    EXECUTE format('SELECT %I.schedule($1,$2,$3)',v_schema)
      USING 'vento-meeting-change-expiry','*/5 * * * *',
        'SELECT public.expire_meeting_change_requests()';
  END IF;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;