-- Migration 38: reuse of paid-but-unrecorded lesson time (the hours balance).
-- Every write stays inside one rolled-back transaction, never live production.
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.act_as(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claim.sub',uid::text,true); EXECUTE 'SET LOCAL ROLE authenticated'; END $$;
CREATE FUNCTION pg_temp.reset() RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claim.sub','',true); END $$;

-- Fresh students with no prior meetings, so the schedule-overlap guard is not
-- tripped by fixtures that other test files committed for the seeded students.
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('00000000-0000-0000-0000-0000000000f1','balstudent@test.invalid','{"full_name":"Saldo Aluno"}'),
 ('00000000-0000-0000-0000-0000000000f2','balother@test.invalid','{"full_name":"Saldo Outro"}');

-- Build a confirmed single-meeting test booking of p_hours, recorded short by
-- p_done_minutes so it keeps a balance. Returns the booking id.
CREATE FUNCTION pg_temp.short_booking(
  p_admin uuid, p_instructor uuid, p_student uuid, p_beach uuid,
  p_hours integer, p_done_minutes integer
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_bid uuid; v_mid uuid; v_pin text; v_start timestamptz;
BEGIN
  v_start:=(((now() AT TIME ZONE 'America/Fortaleza')::date+40)::timestamp+interval '9 hours') AT TIME ZONE 'America/Fortaleza';
  PERFORM pg_temp.act_as(p_admin);
  v_bid:=public.create_admin_test_booking(p_instructor,p_student,p_beach,
    jsonb_build_array(jsonb_build_object(
      'starts_at',to_char(v_start AT TIME ZONE 'America/Fortaleza','YYYY-MM-DD"T"HH24:MI:SS')||'-03:00',
      'hours',p_hours)));
  PERFORM pg_temp.reset();
  SELECT id INTO v_mid FROM public.booking_meetings WHERE booking_id=v_bid;
  SELECT presence_code INTO v_pin FROM public.bookings WHERE id=v_bid;
  -- Deliver the meeting short, inside the rollback, by dating it in the past.
  UPDATE public.booking_meetings SET starts_at=now()-interval '2 hours' WHERE id=v_mid;
  PERFORM pg_temp.act_as(p_instructor);
  PERFORM public.start_ordered_meeting(v_mid,v_pin);
  PERFORM public.record_meeting(v_mid,p_done_minutes,'short record for balance test');
  PERFORM pg_temp.reset();
  RETURN v_bid;
END $$;

DO $$
DECLARE
  v_student uuid:='00000000-0000-0000-0000-0000000000f1';
  v_other_student uuid:='00000000-0000-0000-0000-0000000000f2';
  v_instructor uuid:='00000000-0000-0000-0000-0000000000a2';
  v_admin uuid:='00000000-0000-0000-0000-00000000000a';
  v_other_instructor uuid;
  v_beach uuid;
  v_bid uuid; v_mid uuid; v_pin text; v_total integer;
  v_req uuid; v_future timestamptz;
BEGIN
  SELECT id INTO v_beach FROM public.beaches WHERE slug='prea';
  SELECT id INTO v_other_instructor FROM public.instructors
    WHERE status='approved' AND id<>v_instructor ORDER BY id LIMIT 1;
  v_future:=now()+interval '5 days';

  -- =====================================================================
  -- A. Under-recorded booking keeps a balance and never auto-completes.
  -- =====================================================================
  v_bid:=pg_temp.short_booking(v_admin,v_instructor,v_student,v_beach,2,90);
  SELECT total_cents INTO v_total FROM public.bookings WHERE id=v_bid;
  ASSERT (SELECT status FROM public.bookings WHERE id=v_bid)='confirmed',
    'A short record must not complete the booking';
  PERFORM pg_temp.act_as(v_student);
  ASSERT public.booking_balance_minutes(v_bid)=30,
    'Balance is contracted minus recorded (120-90)';
  PERFORM pg_temp.reset();

  -- Ownership: a resource existing is not permission to touch it.
  IF v_other_student IS NOT NULL THEN
    PERFORM pg_temp.act_as(v_other_student);
    BEGIN
      PERFORM public.request_balance_meeting(v_bid,v_future,30);
      RAISE EXCEPTION 'A non-owner scheduled a make-up';
    EXCEPTION WHEN sqlstate 'P0002' THEN NULL; END;
    PERFORM pg_temp.reset();
  END IF;

  -- The instructor cannot open a student's make-up request.
  PERFORM pg_temp.act_as(v_instructor);
  BEGIN
    PERFORM public.request_balance_meeting(v_bid,v_future,30);
    RAISE EXCEPTION 'An instructor requested a make-up';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.reset();

  PERFORM pg_temp.act_as(v_student);
  -- Cannot schedule more than the balance.
  BEGIN
    PERFORM public.request_balance_meeting(v_bid,v_future,31);
    RAISE EXCEPTION 'Over-balance request accepted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  -- Must respect the 72h minimum notice.
  BEGIN
    PERFORM public.request_balance_meeting(v_bid,now()+interval '1 hour',30);
    RAISE EXCEPTION 'Make-up inside the 72h window accepted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  -- A valid proposal for the exact sub-hour balance.
  v_req:=public.request_balance_meeting(v_bid,v_future,30);
  ASSERT v_req IS NOT NULL,'Student proposes the 30-minute make-up';
  -- Only one pending request per booking.
  BEGIN
    PERFORM public.request_balance_meeting(v_bid,v_future+interval '1 day',30);
    RAISE EXCEPTION 'A second pending make-up was accepted';
  EXCEPTION WHEN sqlstate '55000' THEN NULL; END;
  PERFORM pg_temp.reset();

  -- Only the assigned instructor may respond.
  IF v_other_instructor IS NOT NULL THEN
    PERFORM pg_temp.act_as(v_other_instructor);
    BEGIN
      PERFORM public.respond_balance_meeting(v_req,true);
      RAISE EXCEPTION 'A different instructor answered the make-up';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    PERFORM pg_temp.reset();
  END IF;
  -- The student cannot answer (instructor role required).
  PERFORM pg_temp.act_as(v_student);
  BEGIN
    PERFORM public.respond_balance_meeting(v_req,true);
    RAISE EXCEPTION 'Student answered their own make-up';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.reset();

  -- The assigned instructor accepts; a new scheduled meeting appears, no charge.
  PERFORM pg_temp.act_as(v_instructor);
  PERFORM public.respond_balance_meeting(v_req,true);
  PERFORM pg_temp.reset();
  SELECT created_meeting_id INTO v_mid FROM public.balance_meeting_requests WHERE id=v_req;
  ASSERT v_mid IS NOT NULL,'Accepting creates the make-up meeting';
  ASSERT (SELECT minutes FROM public.booking_meetings WHERE id=v_mid)=30,
    'A sub-hour make-up keeps its exact minutes';
  ASSERT (SELECT total_cents FROM public.bookings WHERE id=v_bid)=v_total,
    'The frozen snapshot is unchanged — no new charge';
  PERFORM pg_temp.act_as(v_student);
  ASSERT public.booking_balance_minutes(v_bid)=0,
    'The scheduled make-up consumes the balance';
  PERFORM pg_temp.reset();
  ASSERT (SELECT status FROM public.bookings WHERE id=v_bid)='confirmed',
    'The booking waits for the make-up to be delivered';

  -- Deliver the make-up; the booking completes once the paid minutes are met.
  SELECT presence_code INTO v_pin FROM public.bookings WHERE id=v_bid;
  UPDATE public.booking_meetings SET starts_at=now()-interval '10 minutes' WHERE id=v_mid;
  PERFORM pg_temp.act_as(v_instructor);
  PERFORM public.start_ordered_meeting(v_mid,v_pin);
  PERFORM public.record_meeting(v_mid,30,'make-up delivered');
  PERFORM pg_temp.reset();
  ASSERT (SELECT status FROM public.bookings WHERE id=v_bid)='completed',
    'Full delivery completes the booking';
  ASSERT (SELECT sum(done_minutes) FROM public.booking_meetings WHERE booking_id=v_bid)=120,
    'All contracted minutes are recorded';
  -- Replaying a completed meeting must never double-count paid minutes.
  -- The legacy helper is used by this regression suite until its callers
  -- are migrated to record_meeting_with_skills.
  PERFORM pg_temp.act_as(v_instructor);
  BEGIN
    PERFORM public.record_meeting(v_mid,30,'duplicate completion attempt');
    RAISE EXCEPTION 'A completed make-up was recorded twice';
  EXCEPTION
    WHEN invalid_parameter_value OR object_not_in_prerequisite_state THEN NULL;
  END;
  PERFORM pg_temp.reset();
  ASSERT (SELECT sum(done_minutes) FROM public.booking_meetings WHERE booking_id=v_bid)=120,
    'Duplicate completion must not increase recorded minutes';
  ASSERT (SELECT status FROM public.bookings WHERE id=v_bid)='completed',
    'Duplicate completion must not reopen a completed booking';

  -- =====================================================================
  -- B. The student may close a leftover balance instead of rescheduling.
  -- =====================================================================
  v_bid:=pg_temp.short_booking(v_admin,v_instructor,v_student,v_beach,2,90);
  PERFORM pg_temp.act_as(v_student);
  ASSERT public.booking_balance_minutes(v_bid)=30,'Second booking keeps its balance';
  PERFORM pg_temp.reset();
  -- Only the owner closes it.
  PERFORM pg_temp.act_as(v_instructor);
  BEGIN
    PERFORM public.close_booking_balance(v_bid);
    RAISE EXCEPTION 'Instructor closed the student balance';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.reset();
  PERFORM pg_temp.act_as(v_student);
  PERFORM public.close_booking_balance(v_bid);
  PERFORM pg_temp.reset();
  ASSERT (SELECT status FROM public.bookings WHERE id=v_bid)='completed',
    'Closing the balance finalises the booking';

  -- =====================================================================
  -- C. A pending make-up that times out just lapses; the balance survives.
  -- =====================================================================
  v_bid:=pg_temp.short_booking(v_admin,v_instructor,v_student,v_beach,2,90);
  PERFORM pg_temp.act_as(v_student);
  v_req:=public.request_balance_meeting(v_bid,now()+interval '6 days',30);
  PERFORM pg_temp.reset();
  UPDATE public.balance_meeting_requests SET expires_at=now()-interval '1 minute' WHERE id=v_req;
  ASSERT public.expire_balance_meeting_requests()>=1,'The sweep expires overdue requests';
  ASSERT (SELECT status FROM public.balance_meeting_requests WHERE id=v_req)='expired',
    'The request lapses';
  ASSERT (SELECT status FROM public.bookings WHERE id=v_bid)='confirmed',
    'The booking is not cancelled by a missed make-up';
  PERFORM pg_temp.act_as(v_student);
  ASSERT public.booking_balance_minutes(v_bid)=30,
    'The paid balance stays available after expiry';
  PERFORM pg_temp.reset();
  ASSERT EXISTS(SELECT 1 FROM public.app_notifications
    WHERE recipient_id=v_student AND title='Pedido de reposição expirado'),
    'The student is told the request lapsed';
END $$;
ROLLBACK;
