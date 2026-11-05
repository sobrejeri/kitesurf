-- Isolated SQL regression: unused minutes become an approved make-up meeting,
-- not a new purchase. This test rolls back every fixture and never touches production.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.as_balance(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claim.sub',uid::text,false); EXECUTE 'SET ROLE authenticated'; END $$;
CREATE FUNCTION pg_temp.reset_balance() RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claim.sub','',false); END $$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('00000000-0000-0000-0000-000000000b97','balance-student@test.invalid','{"full_name":"Balance student"}'),
 ('00000000-0000-0000-0000-000000000b98','balance-other@test.invalid','{"full_name":"Other student"}');

DO $$
DECLARE
 sid uuid:='00000000-0000-0000-0000-000000000b97';
 other_id uuid:='00000000-0000-0000-0000-000000000b98';
 beach uuid; req uuid; offer uuid; bid uuid; instructor uuid; first_meeting uuid;
 pin text; due timestamptz; makeup timestamptz; makeup_id uuid;
 original_amount integer; original_partner integer; original_platform integer; search_hold uuid;
BEGIN
 SELECT id INTO beach FROM public.beaches WHERE slug='prea';
 FOR instructor IN SELECT id FROM public.instructors WHERE status='approved' LOOP
   PERFORM pg_temp.as_balance(instructor);
   PERFORM public.save_my_schedule(ARRAY[0,1,2,3,4,5,6],'08:00','18:00',0);
   PERFORM pg_temp.reset_balance();
 END LOOP;
 due:=(((now() AT TIME ZONE 'America/Fortaleza')::date+20)::timestamp+interval '10 hours')
       AT TIME ZONE 'America/Fortaleza';
 makeup:=(((now() AT TIME ZONE 'America/Fortaleza')::date+25)::timestamp+interval '11 hours')
       AT TIME ZONE 'America/Fortaleza';
 PERFORM pg_temp.as_balance(sid);
 req:=public.create_instructor_request_with_preference(
   beach,'first_time','Português',
   jsonb_build_array(jsonb_build_object('starts_at',due,'hours',1)),
   null,false,null);
 PERFORM pg_temp.reset_balance();
 SELECT o.id,o.instructor_id INTO offer,instructor
 FROM public.instructor_offers o WHERE o.request_id=req AND o.status='offered';
 ASSERT offer IS NOT NULL,'Request must offer an instructor';
 PERFORM pg_temp.as_balance(instructor);
 bid:=public.accept_instructor_offer(offer);
 PERFORM pg_temp.reset_balance();
 SELECT total_cents,partner_cents,platform_cents,presence_code
 INTO original_amount,original_partner,original_platform,pin
 FROM public.bookings WHERE id=bid;
 PERFORM pg_temp.as_balance(sid);
 PERFORM public.confirm_validation_lesson(bid);
 PERFORM pg_temp.reset_balance();
 SELECT id INTO first_meeting FROM public.booking_meetings WHERE booking_id=bid;
 -- Move only the test fixture into the past, to permit starting it within this transaction.
 UPDATE public.booking_meetings SET starts_at=now()-interval '2 hours' WHERE id=first_meeting;
 PERFORM pg_temp.as_balance(instructor);
 PERFORM public.start_ordered_meeting(first_meeting,pin);
 PERFORM public.record_meeting_with_skills(first_meeting,30,ARRAY[1],ARRAY[2]);
 PERFORM pg_temp.reset_balance();
 ASSERT (SELECT status FROM public.bookings WHERE id=bid)='completed',
   'Partial completion initially ends the booking';
 ASSERT (SELECT sum(done_minutes) FROM public.booking_meetings WHERE booking_id=bid)=30;

 -- Reject attempts to spend another student's balance.
 PERFORM pg_temp.as_balance(other_id);
 BEGIN
   PERFORM public.request_booking_balance(bid,makeup,30);
   RAISE EXCEPTION 'Different student was allowed to request balance';
 EXCEPTION WHEN no_data_found THEN NULL; END;
 PERFORM pg_temp.reset_balance();

 -- A pending instructor search reserves the student's time too.
 PERFORM pg_temp.as_balance(sid);
 search_hold:=public.create_instructor_request_with_preference(
   beach,'first_time','Português',
   jsonb_build_array(jsonb_build_object('starts_at',makeup,'hours',1)),
   null,false,null);
 BEGIN
   PERFORM public.request_booking_balance(bid,makeup,30);
   RAISE EXCEPTION 'Makeup overlapped an active instructor search';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 PERFORM pg_temp.reset_balance();
 UPDATE public.instructor_requests SET expires_at=now()-interval '1 minute'
   WHERE id=search_hold;

 PERFORM pg_temp.as_balance(sid);
 makeup_id:=public.request_booking_balance(bid,makeup,30);
 BEGIN
   PERFORM public.request_booking_balance(bid,makeup+interval '1 day',30);
   RAISE EXCEPTION 'Two pending makeup requests were allowed';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 PERFORM pg_temp.reset_balance();

 -- Only the assigned instructor can accept. Repeat acceptance is forbidden.
 PERFORM pg_temp.as_balance(instructor);
 PERFORM public.respond_booking_balance(makeup_id,true);
 BEGIN
   PERFORM public.respond_booking_balance(makeup_id,true);
   RAISE EXCEPTION 'A request was accepted twice';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 PERFORM pg_temp.reset_balance();

 ASSERT (SELECT status FROM public.bookings WHERE id=bid)='confirmed';
 ASSERT (SELECT count(*) FROM public.booking_meetings WHERE booking_id=bid)=2;
 ASSERT EXISTS(SELECT 1 FROM public.booking_meetings
   WHERE booking_id=bid AND minutes=30 AND starts_at=makeup AND status='scheduled');
 ASSERT (SELECT total_cents FROM public.bookings WHERE id=bid)=original_amount;
 ASSERT (SELECT partner_cents FROM public.bookings WHERE id=bid)=original_partner;
 ASSERT (SELECT platform_cents FROM public.bookings WHERE id=bid)=original_platform;
 ASSERT NOT EXISTS (SELECT 1 FROM public.test_payment_attempts WHERE booking_id=bid);
 ASSERT (SELECT coalesce(sum(
   CASE WHEN status='done' THEN done_minutes
        WHEN status IN ('scheduled','in_progress') THEN minutes ELSE 0 END),0)
   FROM public.booking_meetings WHERE booking_id=bid)=60,
   'Recorded plus reserved minutes may not exceed the contracted hour';
END $$;
ROLLBACK;
