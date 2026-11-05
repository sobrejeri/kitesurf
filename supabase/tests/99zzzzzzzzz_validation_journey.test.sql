-- Whole no-checkout journey in an isolated transaction, never live production.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.act_as(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claim.sub',uid::text,false); EXECUTE 'SET ROLE authenticated'; END $$;
CREATE FUNCTION pg_temp.reset() RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claim.sub','',false); END $$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('00000000-0000-0000-0000-000000000b99','journey@test.invalid','{"full_name":"Journey test"}');
DO $$
DECLARE sid uuid:='00000000-0000-0000-0000-000000000b99'; req uuid; bid uuid; tid uuid; oid uuid; beach uuid;
 t timestamptz; plan jsonb; first_id uuid; last_id uuid; pin text; frozen public.bookings;
 message_id uuid; rate_id uuid; rerequest uuid; after_summary record; before_summary record;
BEGIN
 SELECT id INTO beach FROM public.beaches WHERE slug='prea';
 FOR tid IN SELECT id FROM public.instructors WHERE status='approved' LOOP
   PERFORM pg_temp.act_as(tid);
   PERFORM public.save_my_schedule(ARRAY[0,1,2,3,4,5,6],'08:00','18:00',0);
   PERFORM pg_temp.reset();
 END LOOP;
 t:=(((now() AT TIME ZONE 'America/Fortaleza')::date+90)::timestamp+interval '10 hours') AT TIME ZONE 'America/Fortaleza';
 plan:=jsonb_build_array(jsonb_build_object('starts_at',t,'hours',1),jsonb_build_object('starts_at',t+interval '1 day','hours',1));
 PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
 SELECT * INTO before_summary FROM public.partner_summary();
 PERFORM pg_temp.reset();
 PERFORM pg_temp.act_as(sid);
 req:=public.create_instructor_request_with_preference(beach,'first_time','Português',plan,'MAR-E-VENTO',false,null);
 PERFORM pg_temp.reset();
 SELECT id,instructor_id INTO oid,tid FROM public.instructor_offers WHERE request_id=req AND status='offered';
 ASSERT oid IS NOT NULL,'An available instructor receives the request';
 PERFORM pg_temp.act_as(tid);
 bid:=public.accept_instructor_offer(oid);
 PERFORM pg_temp.reset();
 SELECT * INTO frozen FROM public.bookings WHERE id=bid;
 ASSERT frozen.status='awaiting_payment';
 PERFORM pg_temp.act_as(sid);
 PERFORM public.confirm_validation_lesson(bid);
 PERFORM public.confirm_validation_lesson(bid);
 ASSERT EXISTS(SELECT 1 FROM public.bookings WHERE id=bid AND status='confirmed' AND is_test);
 message_id:=public.send_booking_message(bid,'Isolated journey: lesson confirmed without checkout');
 PERFORM pg_temp.reset();
 ASSERT NOT EXISTS(SELECT 1 FROM public.test_payment_attempts WHERE booking_id=bid);
 ASSERT (SELECT total_cents FROM public.bookings WHERE id=bid)=frozen.total_cents;
 SELECT id INTO first_id FROM public.booking_meetings WHERE booking_id=bid ORDER BY position LIMIT 1;
 SELECT id INTO last_id FROM public.booking_meetings WHERE booking_id=bid ORDER BY position DESC LIMIT 1;
 SELECT presence_code INTO pin FROM public.bookings WHERE id=bid;
 -- Advance fixture dates only inside the rollback transaction to exercise lesson completion.
 UPDATE public.booking_meetings SET starts_at=now()-interval '2 hours'+make_interval(hours=>position-1) WHERE booking_id=bid;
 PERFORM pg_temp.act_as(tid);
 PERFORM public.mark_my_booking_chat_read(bid,message_id);
 BEGIN PERFORM public.start_ordered_meeting(last_id,pin); RAISE EXCEPTION 'Out-of-order start allowed';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 PERFORM public.start_ordered_meeting(first_id,pin);
 PERFORM public.record_meeting_with_skills(first_id,45,ARRAY[1],ARRAY[2]);
 ASSERT (SELECT status FROM public.bookings WHERE id=bid)='confirmed','First encounter must not finish a multi-day booking';
 PERFORM public.start_ordered_meeting(last_id,pin);
 PERFORM public.record_meeting_with_skills(last_id,60,ARRAY[3],ARRAY[4]);
 PERFORM public.assess_student_kite_level(last_id,'returning');
 PERFORM pg_temp.reset();
 ASSERT (SELECT status FROM public.bookings WHERE id=bid)='completed';
 ASSERT (SELECT sum(done_minutes) FROM public.booking_meetings WHERE booking_id=bid)=105;
 ASSERT EXISTS(SELECT 1 FROM public.booking_level_assessments WHERE booking_id=bid AND assessed_level='returning');
 PERFORM pg_temp.act_as(sid);
 rate_id:=public.rate_completed_booking(bid,5,'Isolated validation journey');
 ASSERT rate_id IS NOT NULL;
 rerequest:=public.create_instructor_request_with_preference(beach,'returning','Português',
   jsonb_build_array(jsonb_build_object('starts_at',t+interval '2 days','hours',1)),null,false,tid);
 PERFORM pg_temp.reset();
 ASSERT EXISTS(SELECT 1 FROM public.instructor_offers WHERE request_id=rerequest AND instructor_id=tid AND status='offered');
 PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
 SELECT * INTO after_summary FROM public.partner_summary();
 ASSERT (before_summary.bookings,before_summary.pending_cents,before_summary.released_cents)
   IS NOT DISTINCT FROM (after_summary.bookings,after_summary.pending_cents,after_summary.released_cents),
   'No checkout journey must not generate partner revenue';
 PERFORM pg_temp.reset();
END $$;
ROLLBACK;
