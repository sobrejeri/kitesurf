-- Migration 38 | Reuse of paid-but-unrecorded lesson time (the "hours balance").
--
-- A booking contracts total_hours*60 minutes. When the instructor records a
-- meeting for fewer minutes than it was scheduled for (wind died, lesson cut
-- short), the difference is time the student already paid for. Until now
-- record_meeting marked the booking `completed` the moment no meeting was
-- active, stranding that balance and blocking full approval of the hours cycle.
--
-- This migration closes that cycle, touching no money:
--   * record_meeting completes a booking only once the paid minutes are fully
--     delivered (recorded = contracted); otherwise it stays `confirmed` with a
--     visible balance to reschedule.
--   * the student proposes a make-up meeting for the remaining balance with the
--     SAME instructor, who confirms it — mirroring the bilateral reschedule.
--     No booking row is created and no money column changes, so the frozen
--     financial snapshot is untouched: there is no new charge.
--   * the student can close the booking, forfeiting a leftover too small to use.
--
-- A make-up meeting may be shorter than an hour, because the balance is
-- whatever the instructor left unrecorded (e.g. 30 of 120 minutes). Normal
-- bookings are still assembled in whole hours by create_instructor_request;
-- only this path uses the finer granularity.
BEGIN;

-- Relax the whole-hour rule so a sub-hour balance can be scheduled. The lower
-- bound stays positive and the done<=scheduled invariant is unchanged.
ALTER TABLE public.booking_meetings DROP CONSTRAINT booking_meetings_minutes_check;
ALTER TABLE public.booking_meetings
  ADD CONSTRAINT booking_meetings_minutes_check CHECK (minutes BETWEEN 1 AND 480);

-- Make-up meetings can take a booking past its original slot count.
ALTER TABLE public.booking_meetings DROP CONSTRAINT booking_meetings_position_check;
ALTER TABLE public.booking_meetings
  ADD CONSTRAINT booking_meetings_position_check CHECK (position BETWEEN 1 AND 16);

-- ---------------------------------------------------------------------------
-- Canonical balance definition, used by every path so they cannot disagree.
-- Unallocated paid minutes = contracted - recorded - minutes already held by
-- a scheduled or in-progress meeting.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.booking_balance_minutes(p_booking_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT GREATEST(0,
    b.total_hours * 60
    - COALESCE((SELECT sum(m.done_minutes)::integer FROM public.booking_meetings m
                WHERE m.booking_id = b.id AND m.status = 'done'), 0)
    - COALESCE((SELECT sum(m.minutes)::integer FROM public.booking_meetings m
                WHERE m.booking_id = b.id AND m.status IN ('scheduled','in_progress')), 0))
  FROM public.bookings b WHERE b.id = p_booking_id;
$$;
REVOKE ALL ON FUNCTION public.booking_balance_minutes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.booking_balance_minutes(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Make-up requests: the student proposes, the assigned instructor confirms.
-- ---------------------------------------------------------------------------
CREATE TABLE public.balance_meeting_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id),
  instructor_id uuid NOT NULL REFERENCES public.instructors(id),
  proposed_starts_at timestamptz NOT NULL,
  minutes smallint NOT NULL CHECK (minutes BETWEEN 1 AND 480),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','expired')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  responded_at timestamptz,
  created_meeting_id uuid REFERENCES public.booking_meetings(id),
  CONSTRAINT balance_participants_differ CHECK (student_id <> instructor_id)
);
CREATE UNIQUE INDEX balance_request_one_pending_per_booking
  ON public.balance_meeting_requests(booking_id) WHERE status = 'pending';
CREATE INDEX balance_request_due ON public.balance_meeting_requests(expires_at)
  WHERE status = 'pending';
CREATE INDEX balance_request_participants
  ON public.balance_meeting_requests(student_id, instructor_id);

ALTER TABLE public.balance_meeting_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.balance_meeting_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.balance_meeting_requests TO authenticated;
-- Reading a row is not permission over it: participants and admins only.
CREATE POLICY balance_request_participants_read ON public.balance_meeting_requests
  FOR SELECT TO authenticated USING (
    student_id = auth.uid() OR instructor_id = auth.uid() OR public.is_admin()
  );

-- Shared student-side conflict guard: any other non-cancelled meeting of this
-- student overlapping the proposed window, across all their bookings.
CREATE FUNCTION public.student_has_meeting_overlap(
  p_student uuid, p_start timestamptz, p_minutes integer
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.booking_meetings m
    JOIN public.bookings b ON b.id = m.booking_id
    WHERE b.student_id = p_student
      AND m.status <> 'cancelled'
      AND b.status IN ('awaiting_payment','confirmed')
      AND tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.minutes))
          && tstzrange(p_start, p_start + make_interval(mins => p_minutes))
  );
$$;
REVOKE ALL ON FUNCTION public.student_has_meeting_overlap(uuid,timestamptz,integer)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.request_balance_meeting(
  p_booking_id uuid, p_starts_at timestamptz, p_minutes integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_uid uuid := public.require_role(ARRAY['student']::public.app_role[]);
  b public.bookings;
  v_balance integer;
  v_request_id uuid;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF b.id IS NULL OR b.student_id <> v_uid THEN
    RAISE EXCEPTION 'Booking not found' USING errcode = 'P0002';
  END IF;
  IF b.status <> 'confirmed' OR b.instructor_id IS NULL THEN
    RAISE EXCEPTION 'Only a confirmed booking with an instructor has a balance to schedule'
      USING errcode = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.balance_meeting_requests
             WHERE booking_id = b.id AND status = 'pending') THEN
    RAISE EXCEPTION 'A make-up request is already waiting for the instructor'
      USING errcode = '55000';
  END IF;

  v_balance := public.booking_balance_minutes(b.id);
  IF v_balance <= 0 THEN
    RAISE EXCEPTION 'This booking has no balance left to reschedule' USING errcode = '55000';
  END IF;
  IF p_minutes IS NULL OR p_minutes < 1 OR p_minutes > v_balance THEN
    RAISE EXCEPTION 'Make-up minutes must be between 1 and the remaining balance of %', v_balance
      USING errcode = '22023';
  END IF;
  -- Same minimum notice as a reschedule proposal.
  IF p_starts_at IS NULL OR p_starts_at < now() + interval '72 hours' THEN
    RAISE EXCEPTION 'The make-up lesson must start at least 72 hours from now'
      USING errcode = '22023';
  END IF;
  IF public.student_has_meeting_overlap(v_uid, p_starts_at, p_minutes) THEN
    RAISE EXCEPTION 'You already have a lesson in that window' USING errcode = '55000';
  END IF;
  -- No meeting to exclude: a random id never matches a real meeting.
  IF NOT public.can_move_meeting(b.instructor_id, gen_random_uuid(), p_starts_at, p_minutes) THEN
    RAISE EXCEPTION 'The instructor is not available at that time' USING errcode = '55000';
  END IF;

  INSERT INTO public.balance_meeting_requests(
    booking_id, student_id, instructor_id, proposed_starts_at, minutes
  ) VALUES (b.id, v_uid, b.instructor_id, p_starts_at, p_minutes)
  RETURNING id INTO v_request_id;

  INSERT INTO public.app_notifications(recipient_id, category, title, body, href)
  VALUES (b.instructor_id, 'booking', 'Pedido de aula de reposição',
    'Um aluno pediu para reagendar o saldo de horas já pago. Você tem 48 horas para aceitar ou recusar.',
    '/instrutor/aula');

  PERFORM public.write_audit('booking.balance_requested', 'booking', b.id::text,
    jsonb_build_object('balance_minutes', v_balance),
    jsonb_build_object('proposed_starts_at', p_starts_at, 'minutes', p_minutes));
  RETURN v_request_id;
END $$;

CREATE FUNCTION public.respond_balance_meeting(
  p_request_id uuid, p_accept boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_uid uuid := public.require_role(ARRAY['instructor']::public.app_role[]);
  r public.balance_meeting_requests;
  b public.bookings;
  v_balance integer;
  v_position smallint;
  v_meeting_id uuid;
BEGIN
  SELECT * INTO r FROM public.balance_meeting_requests WHERE id = p_request_id;
  IF r.id IS NULL OR r.instructor_id <> v_uid THEN
    RAISE EXCEPTION 'Make-up request not found for this instructor' USING errcode = '42501';
  END IF;
  SELECT * INTO b FROM public.bookings WHERE id = r.booking_id FOR UPDATE;
  SELECT * INTO r FROM public.balance_meeting_requests WHERE id = p_request_id FOR UPDATE;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'Make-up request already decided' USING errcode = '55000';
  END IF;
  IF now() >= r.expires_at THEN
    RAISE EXCEPTION 'Make-up request response deadline expired' USING errcode = '55000';
  END IF;
  IF b.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Booking is no longer confirmed' USING errcode = '55000';
  END IF;
  IF p_accept IS NULL THEN
    RAISE EXCEPTION 'Choose accept or reject' USING errcode = '22023';
  END IF;

  IF p_accept THEN
    v_balance := public.booking_balance_minutes(b.id);
    IF r.minutes > v_balance THEN
      RAISE EXCEPTION 'The remaining balance changed; ask the student to send a new request'
        USING errcode = '55000';
    END IF;
    IF r.proposed_starts_at < now() + interval '24 hours'
      OR public.student_has_meeting_overlap(r.student_id, r.proposed_starts_at, r.minutes)
      OR NOT public.can_move_meeting(b.instructor_id, gen_random_uuid(), r.proposed_starts_at, r.minutes)
    THEN
      RAISE EXCEPTION 'The proposed time is no longer available' USING errcode = '55000';
    END IF;

    SELECT COALESCE(max(position), 0) + 1 INTO v_position
      FROM public.booking_meetings WHERE booking_id = b.id;
    INSERT INTO public.booking_meetings(booking_id, position, starts_at, minutes, status)
    VALUES (b.id, v_position, r.proposed_starts_at, r.minutes, 'scheduled')
    RETURNING id INTO v_meeting_id;
  END IF;

  UPDATE public.balance_meeting_requests
    SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
        responded_at = now(),
        created_meeting_id = v_meeting_id
    WHERE id = r.id;

  INSERT INTO public.app_notifications(recipient_id, category, title, body, href)
  VALUES (r.student_id, 'booking',
    CASE WHEN p_accept THEN 'Aula de reposição confirmada' ELSE 'Aula de reposição recusada' END,
    CASE WHEN p_accept THEN 'O instrutor confirmou a nova aula para usar seu saldo de horas. Nenhuma cobrança foi feita.'
      ELSE 'O instrutor recusou a data proposta. Seu saldo de horas continua disponível para reagendar.' END,
    '/aluno/reserva/' || b.id::text);

  PERFORM public.write_audit('booking.balance_responded', 'booking', b.id::text,
    jsonb_build_object('request_id', r.id, 'minutes', r.minutes),
    jsonb_build_object('accepted', p_accept, 'meeting_id', v_meeting_id));
END $$;

-- The student forfeits a leftover balance too small or inconvenient to use,
-- finalising the booking. No money moves; any refund is handled by support.
CREATE FUNCTION public.close_booking_balance(p_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_uid uuid := public.require_role(ARRAY['student']::public.app_role[]);
  b public.bookings;
  v_balance integer;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF b.id IS NULL OR b.student_id <> v_uid THEN
    RAISE EXCEPTION 'Booking not found' USING errcode = 'P0002';
  END IF;
  IF b.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only a confirmed booking can be closed' USING errcode = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.booking_meetings
             WHERE booking_id = b.id AND status IN ('scheduled','in_progress')) THEN
    RAISE EXCEPTION 'Finish or reschedule the active meetings before closing' USING errcode = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.balance_meeting_requests
             WHERE booking_id = b.id AND status = 'pending') THEN
    RAISE EXCEPTION 'A make-up request is still waiting for a response' USING errcode = '55000';
  END IF;

  v_balance := public.booking_balance_minutes(b.id);
  UPDATE public.bookings SET status = 'completed' WHERE id = b.id;

  PERFORM public.write_audit('booking.balance_closed', 'booking', b.id::text,
    jsonb_build_object('status', 'confirmed', 'balance_minutes', v_balance),
    jsonb_build_object('status', 'completed'),
    'Student closed the booking, forfeiting the remaining balance');
END $$;

-- ---------------------------------------------------------------------------
-- record_meeting: complete a booking only when the paid minutes are fully
-- delivered. A short record now leaves the booking confirmed with a balance.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_meeting(p_meeting_id uuid, p_done_minutes integer, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := public.require_role(array['instructor']::public.app_role[]);
  m public.booking_meetings;
  b public.bookings;
BEGIN
  SELECT * INTO m FROM public.booking_meetings WHERE id = p_meeting_id FOR UPDATE;
  SELECT * INTO b FROM public.bookings WHERE id = m.booking_id;
  IF m.id IS NULL OR b.instructor_id IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'Meeting not found' USING errcode = 'P0002';
  END IF;
  IF m.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Start the meeting with the presence code first' USING errcode = '55000';
  END IF;
  IF p_done_minutes IS NULL OR p_done_minutes < 0 OR p_done_minutes > m.minutes THEN
    RAISE EXCEPTION 'Done minutes must be between 0 and %', m.minutes USING errcode = '22023';
  END IF;

  UPDATE public.booking_meetings
  SET status = 'done', done_minutes = p_done_minutes, note = left(p_note, 1000), recorded_at = now()
  WHERE id = m.id;

  -- Complete only when nothing is active AND the contracted minutes are fully
  -- recorded. Otherwise the booking keeps its balance for a make-up lesson.
  IF NOT EXISTS (
    SELECT 1 FROM public.booking_meetings
    WHERE booking_id = b.id AND status IN ('scheduled', 'in_progress')
  ) AND b.total_hours * 60 <= COALESCE((
    SELECT sum(done_minutes)::integer FROM public.booking_meetings
    WHERE booking_id = b.id AND status = 'done'), 0)
  THEN
    UPDATE public.bookings SET status = 'completed' WHERE id = b.id;
  END IF;

  PERFORM public.write_audit('meeting.recorded', 'booking_meeting', m.id::text,
    jsonb_build_object('status', m.status), jsonb_build_object('done_minutes', p_done_minutes));
END;
$$;

-- ---------------------------------------------------------------------------
-- Expiry: a pending make-up request that times out just lapses. Unlike a
-- reschedule, nothing is cancelled — the paid balance stays available.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.expire_balance_meeting_requests()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  r public.balance_meeting_requests;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.balance_meeting_requests
    WHERE status = 'pending' AND expires_at <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.balance_meeting_requests SET status = 'expired', responded_at = now()
      WHERE id = r.id;
    INSERT INTO public.app_notifications(recipient_id, category, title, body, href)
    VALUES (r.student_id, 'booking', 'Pedido de reposição expirado',
      'O instrutor não respondeu em 48 horas. Seu saldo de horas continua disponível para reagendar.',
      '/aluno/reserva/' || r.booking_id::text);
    PERFORM public.write_audit('booking.balance_expired', 'balance_meeting_request', r.id::text,
      jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'expired'));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.request_balance_meeting(uuid,timestamptz,integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.respond_balance_meeting(uuid,boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_booking_balance(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_balance_meeting_requests()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_balance_meeting(uuid,timestamptz,integer),
  public.respond_balance_meeting(uuid,boolean),
  public.close_booking_balance(uuid) TO authenticated;

-- Schedule expiry only where pg_cron is available (not in isolated CI).
DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    EXECUTE 'SELECT cron.schedule($1,$2,$3)'
      USING 'vento-balance-request-expiry', '*/5 * * * *',
        'SELECT public.expire_balance_meeting_requests()';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
