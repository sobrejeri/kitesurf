-- Migration 38 | Reuse already-contracted lesson minutes, with instructor acceptance.
-- Financial totals, the price version, commissions and checkout are untouched.
-- A completed booking reopens only when the assigned instructor accepts.
BEGIN;

-- Make-up meetings may use the exact residual minutes (e.g. 30 of 120).
-- New time is always capped by the original contracted duration.
ALTER TABLE public.booking_meetings
  DROP CONSTRAINT IF EXISTS booking_meetings_minutes_check;
ALTER TABLE public.booking_meetings
  ADD CONSTRAINT booking_meetings_minutes_check
  CHECK (minutes BETWEEN 1 AND 480);
ALTER TABLE public.booking_meetings
  DROP CONSTRAINT IF EXISTS booking_meetings_position_check;
ALTER TABLE public.booking_meetings
  ADD CONSTRAINT booking_meetings_position_check
  CHECK (position BETWEEN 1 AND 32);

CREATE TABLE public.booking_balance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id),
  instructor_id uuid NOT NULL REFERENCES public.profiles(id),
  starts_at timestamptz NOT NULL,
  minutes smallint NOT NULL CHECK (minutes BETWEEN 1 AND 480),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '12 hours'),
  responded_at timestamptz
);
CREATE UNIQUE INDEX booking_balance_one_pending
  ON public.booking_balance_requests(booking_id) WHERE status='pending';
CREATE INDEX booking_balance_instructor_pending
  ON public.booking_balance_requests(instructor_id, created_at DESC)
  WHERE status='pending';
ALTER TABLE public.booking_balance_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_balance_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.booking_balance_requests TO authenticated;
CREATE POLICY booking_balance_participant_read
  ON public.booking_balance_requests FOR SELECT TO authenticated
  USING (student_id=auth.uid() OR instructor_id=auth.uid() OR public.is_admin());

-- Fixed-time checks for both parties; a browser cannot bypass the conflict guard.
CREATE FUNCTION public.can_student_attend_balance(
  p_student uuid, p_start timestamptz, p_minutes integer
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.booking_meetings m
    JOIN public.bookings b ON b.id=m.booking_id
    WHERE b.student_id=p_student
      AND m.status IN ('scheduled','in_progress')
      AND (b.status='confirmed'
        OR (b.status='awaiting_payment' AND b.created_at>now()-interval '10 minutes'))
      AND tstzrange(m.starts_at,m.starts_at+make_interval(mins=>m.minutes),'[)')
          && tstzrange(p_start,p_start+make_interval(mins=>p_minutes),'[)')
  ) AND NOT EXISTS (
    -- Searching requests also hold a student's slot until expiry.
    SELECT 1 FROM public.instructor_requests r
    CROSS JOIN LATERAL jsonb_array_elements(r.meetings) AS slot(value)
    WHERE r.student_id=p_student AND r.status='searching' AND r.expires_at>now()
      AND tstzrange(
        (slot.value->>'starts_at')::timestamptz,
        (slot.value->>'starts_at')::timestamptz
          +make_interval(hours=>(slot.value->>'hours')::integer),'[)')
          && tstzrange(p_start,p_start+make_interval(mins=>p_minutes),'[)')
  );
$$;
REVOKE ALL ON FUNCTION public.can_student_attend_balance(uuid,timestamptz,integer)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.request_booking_balance(
  p_booking_id uuid, p_start timestamptz, p_minutes integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  uid uuid:=public.require_role(ARRAY['student']::public.app_role[]);
  b public.bookings;
  used_minutes integer;
  request_id uuid;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id=p_booking_id;
  IF b.id IS NULL OR b.student_id<>uid OR b.instructor_id IS NULL THEN
    RAISE EXCEPTION 'Booking not found' USING errcode='P0002';
  END IF;
  -- Serialize balance changes and approvals with this booking row.
  SELECT * INTO b FROM public.bookings WHERE id=p_booking_id FOR UPDATE;
  IF b.status<>'completed' THEN
    RAISE EXCEPTION 'Complete the existing meetings first' USING errcode='55000';
  END IF;
  IF p_start IS NULL OR p_start<now()+interval '72 hours'
     OR p_start>now()+interval '90 days' THEN
    RAISE EXCEPTION 'Choose a time between 72 hours and 90 days from now'
      USING errcode='22023';
  END IF;
  SELECT coalesce(sum(CASE WHEN m.status='done' THEN m.done_minutes
                 WHEN m.status IN ('scheduled','in_progress') THEN m.minutes ELSE 0 END),0)
    INTO used_minutes FROM public.booking_meetings m WHERE m.booking_id=b.id;
  IF p_minutes IS NULL OR p_minutes<1 OR p_minutes>480
     OR p_minutes>b.total_hours*60-used_minutes THEN
    RAISE EXCEPTION 'Requested minutes exceed the existing lesson balance'
      USING errcode='22023';
  END IF;
  UPDATE public.booking_balance_requests SET status='expired'
    WHERE booking_id=b.id AND status='pending' AND expires_at<=now();
  IF EXISTS(SELECT 1 FROM public.booking_balance_requests
            WHERE booking_id=b.id AND status='pending') THEN
    RAISE EXCEPTION 'A balance request is awaiting the instructor'
      USING errcode='55000';
  END IF;
  IF NOT public.can_student_attend_balance(uid,p_start,p_minutes) THEN
    RAISE EXCEPTION 'Student has another lesson at this time'
      USING errcode='23505';
  END IF;
  INSERT INTO public.booking_balance_requests
    (booking_id,student_id,instructor_id,starts_at,minutes)
  VALUES(b.id,uid,b.instructor_id,p_start,p_minutes)
  RETURNING id INTO request_id;
  INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
  VALUES(b.instructor_id,'booking','Pedido de reposição de aula',
    'O aluno quer agendar minutos restantes da reserva, sem nova cobrança.',
    '/instrutor/agenda');
  PERFORM public.write_audit('booking.balance_requested','booking',b.id::text,
    NULL,jsonb_build_object('request_id',request_id,'minutes',p_minutes,'starts_at',p_start),
    'Student requested existing lesson minutes with the same instructor');
  RETURN request_id;
END;
$$;

CREATE FUNCTION public.respond_booking_balance(
  p_request_id uuid, p_accept boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  uid uuid:=public.require_role(ARRAY['instructor']::public.app_role[]);
  req public.booking_balance_requests;
  b public.bookings;
  used_minutes integer;
  next_position integer;
BEGIN
  -- Read identifiers first, lock instructor -> booking -> request consistently.
  SELECT * INTO req FROM public.booking_balance_requests WHERE id=p_request_id;
  IF req.id IS NULL OR req.instructor_id<>uid THEN
    RAISE EXCEPTION 'Request not found' USING errcode='P0002';
  END IF;
  PERFORM 1 FROM public.instructors WHERE id=uid FOR UPDATE;
  SELECT * INTO b FROM public.bookings WHERE id=req.booking_id FOR UPDATE;
  SELECT * INTO req FROM public.booking_balance_requests WHERE id=p_request_id FOR UPDATE;
  IF req.status<>'pending' OR req.expires_at<=now() THEN
    RAISE EXCEPTION 'Request is no longer active' USING errcode='55000';
  END IF;
  IF b.status<>'completed' OR b.student_id<>req.student_id
    OR b.instructor_id IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'Booking can no longer use this balance'
      USING errcode='55000';
  END IF;
  IF p_accept IS NULL THEN
    RAISE EXCEPTION 'Select accept or reject' USING errcode='22023';
  END IF;
  IF NOT p_accept THEN
    UPDATE public.booking_balance_requests
      SET status='rejected',responded_at=now() WHERE id=req.id;
    INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
    VALUES(b.student_id,'booking','Novo horário não aceito',
      'O instrutor recusou o pedido. Você pode escolher outra data.',
      '/aluno/reserva/'||b.id::text);
    PERFORM public.write_audit('booking.balance_rejected','booking',b.id::text,
      NULL,jsonb_build_object('request_id',req.id),'Instructor rejected balance request');
    RETURN;
  END IF;
  IF req.starts_at<now()+interval '72 hours' OR req.starts_at>now()+interval '90 days' THEN
    RAISE EXCEPTION 'Proposed time is no longer valid' USING errcode='22023';
  END IF;
  SELECT coalesce(sum(CASE WHEN m.status='done' THEN m.done_minutes
                 WHEN m.status IN ('scheduled','in_progress') THEN m.minutes ELSE 0 END),0),
         coalesce(max(m.position),0)+1
    INTO used_minutes,next_position
    FROM public.booking_meetings m WHERE m.booking_id=b.id;
  IF req.minutes>b.total_hours*60-used_minutes OR next_position>32 THEN
    RAISE EXCEPTION 'Not enough existing balance or meeting slots'
      USING errcode='55000';
  END IF;
  -- All availability checks are repeated under the instructor lock.
  IF NOT public.can_move_meeting(uid,
    '00000000-0000-0000-0000-000000000000'::uuid,req.starts_at,req.minutes)
    OR NOT public.can_student_attend_balance(b.student_id,req.starts_at,req.minutes) THEN
    RAISE EXCEPTION 'Student or instructor is unavailable at this time'
      USING errcode='23505';
  END IF;
  UPDATE public.booking_balance_requests SET status='accepted',responded_at=now()
    WHERE id=req.id;
  INSERT INTO public.booking_meetings(booking_id,position,starts_at,minutes)
    VALUES(b.id,next_position,req.starts_at,req.minutes);
  UPDATE public.bookings SET status='confirmed' WHERE id=b.id;
  PERFORM public.write_audit('booking.balance_accepted','booking',b.id::text,
    jsonb_build_object('status','completed'),
    jsonb_build_object('status','confirmed','minutes',req.minutes,'request_id',req.id),
    'Booked remaining minutes; no price/payment/commission changes');
END;
$$;

REVOKE ALL ON FUNCTION public.request_booking_balance(uuid,timestamptz,integer),
  public.respond_booking_balance(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_booking_balance(uuid,timestamptz,integer),
  public.respond_booking_balance(uuid,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
