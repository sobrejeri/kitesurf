-- Migrations 30-31: mutual later-only dates, 12h response, 12h choice, preserve sale.
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.as_user_30(p_user uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub',p_user::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
CREATE FUNCTION pg_temp.reset_user_30() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub','',true);
END $$;

DO $$
DECLARE
  v_student uuid:='00000000-0000-0000-0000-0000000000b2';
  v_instructor uuid:='00000000-0000-0000-0000-0000000000a2';
  v_admin uuid:='00000000-0000-0000-0000-00000000000a';
  v_beach uuid;
  v_start timestamptz;
  v_next timestamptz;
  v_booking uuid;
  v_meeting uuid;
  v_request uuid;
  v_second uuid;
BEGIN
  SELECT id INTO v_beach FROM public.beaches WHERE slug='prea';
  v_start:=(((now() AT TIME ZONE 'America/Fortaleza')::date+40)::timestamp
    + interval '11 hours') AT TIME ZONE 'America/Fortaleza';
  v_next:=v_start+interval '7 days';

  PERFORM pg_temp.as_user_30(v_admin);
  v_booking:=public.create_admin_test_booking(
    v_instructor,v_student,v_beach,
    jsonb_build_array(jsonb_build_object(
      'starts_at',to_char(v_start AT TIME ZONE 'America/Fortaleza',
        'YYYY-MM-DD"T"HH24:MI:SS')||'-03:00','hours',2
    ))
  );
  PERFORM pg_temp.reset_user_30();
  SELECT id INTO v_meeting FROM public.booking_meetings WHERE booking_id=v_booking;

  PERFORM pg_temp.as_user_30(v_student);
  v_request:=public.request_meeting_change(
    v_meeting,v_next,'Preciso mudar o horário deste encontro.');
  ASSERT EXISTS(SELECT 1 FROM public.meeting_change_requests
    WHERE id=v_request AND status='pending' AND requester_id=v_student
      AND responder_id=v_instructor), 'Student initiated change';
  BEGIN
    PERFORM public.respond_meeting_change(v_request,true);
    RAISE EXCEPTION 'Student approved their own request';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.request_meeting_change(
      v_meeting,v_next+interval '7 days','Segunda tentativa sem resposta.');
    RAISE EXCEPTION 'Parallel request was accepted';
  EXCEPTION WHEN sqlstate '55000' THEN
    ASSERT SQLERRM='Another change request is waiting for approval';
  END;
  PERFORM pg_temp.reset_user_30();

  PERFORM pg_temp.as_user_30(v_instructor);
  ASSERT EXISTS(SELECT 1 FROM public.meeting_change_requests WHERE id=v_request),
    'Responder sees request';
  PERFORM public.respond_meeting_change(v_request,true);
  PERFORM pg_temp.reset_user_30();
  ASSERT (SELECT starts_at FROM public.booking_meetings WHERE id=v_meeting)=v_next,
    'Approved change updates meeting start';
  ASSERT (SELECT status FROM public.meeting_change_requests WHERE id=v_request)='accepted',
    'Approved change is audited';

  PERFORM pg_temp.as_user_30(v_instructor);
  v_second:=public.request_meeting_change(
    v_meeting,v_next+interval '7 days','Instrutor precisa alterar o dia por imprevisto.');
  PERFORM pg_temp.reset_user_30();
  PERFORM pg_temp.as_user_30(v_student);
  PERFORM public.respond_meeting_change(v_second,false);
  PERFORM pg_temp.reset_user_30();
  ASSERT (SELECT status FROM public.meeting_change_requests WHERE id=v_second)='rejected',
    'Student can reject instructor request';
  ASSERT (SELECT starts_at FROM public.booking_meetings WHERE id=v_meeting)=v_next,
    'Rejection preserves existing date';
  -- Simulate the instructor's unused 12h decision window ending before a new
  -- student request on the same booking can be opened.
  UPDATE public.meeting_change_requests SET choice_expires_at=NULL
    WHERE id=v_second;

  PERFORM pg_temp.as_user_30(v_student);
  v_request:=public.request_meeting_change(
    v_meeting,v_next+interval '7 days','Solicito alteração e espero resposta.');
  PERFORM pg_temp.reset_user_30();

  UPDATE public.meeting_change_requests SET expires_at=now()-interval '1 minute'
    WHERE id=v_request;
  ASSERT public.expire_meeting_change_requests()>=1,
    'Scheduled sweep should process 12h response deadline';
  ASSERT (SELECT status FROM public.meeting_change_requests WHERE id=v_request)='expired',
    'Change request expires but booking does not';
  ASSERT (SELECT status FROM public.bookings WHERE id=v_booking)='confirmed',
    'Booking must survive a missing instructor response';
  ASSERT (SELECT choice_expires_at FROM public.meeting_change_requests WHERE id=v_request)>now(),
    'Student receives a new 12h decision window';
  ASSERT EXISTS(SELECT 1 FROM public.app_notifications
    WHERE recipient_id=v_student AND title='Prazo de resposta encerrado'),
    'Student is notified about choice window';

  -- No student decision: default to transfer, not automatic cancellation.
  UPDATE public.meeting_change_requests SET choice_expires_at=now()-interval '1 minute'
    WHERE id=v_request;
  ASSERT public.expire_meeting_change_requests()>=1,
    'Scheduled sweep should preserve sale through instructor reassignment';
  ASSERT (SELECT status FROM public.bookings WHERE id=v_booking)='confirmed',
    'Booking stays confirmed after both 12-hour windows';
  ASSERT (SELECT instructor_id FROM public.bookings WHERE id=v_booking) IS NULL,
    'The original teacher is released to allow a replacement';
  ASSERT (SELECT status FROM public.booking_meetings WHERE id=v_meeting)='scheduled',
    'The student appointment stays scheduled';
  ASSERT (SELECT resolution FROM public.meeting_change_requests WHERE id=v_request)
    ='replacement_requested', 'Choice records automatic queue handoff';
END $$;
ROLLBACK;