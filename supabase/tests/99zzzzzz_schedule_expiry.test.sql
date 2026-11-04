\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE bid uuid; beach uuid; pricing bigint; slots jsonb; starts timestamptz:=now()+interval '390 days';
BEGIN
 SELECT id INTO beach FROM public.beaches WHERE slug='prea';
 SELECT id INTO pricing FROM public.price_versions ORDER BY id DESC LIMIT 1;
 slots:=jsonb_build_array(jsonb_build_object('starts_at',starts,'hours',1));
 INSERT INTO public.bookings(code,student_id,instructor_id,price_version_id,beach_id,
   level,language,total_hours,hourly_rate_cents,total_cents,platform_cents,instructor_net_cents,presence_code,created_at)
 VALUES('VNT-EXPIRED-HOLD-TEST','00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000000a1',pricing,beach,'first_time','Português',
   1,30000,30000,4500,25500,'1234',now()-interval '11 minutes') RETURNING id INTO bid;
 INSERT INTO public.booking_meetings(booking_id,position,starts_at,minutes) VALUES(bid,1,starts,60);
 INSERT INTO public.instructor_requests(student_id,beach_id,level,language,meetings,total_hours,price_version_id)
 VALUES('00000000-0000-0000-0000-0000000000b1',beach,'first_time','Português',slots,1,pricing);
 ASSERT (SELECT status FROM public.bookings WHERE id=bid)='cancelled',
   'A stale confirmation window must be released before a new search';
 BEGIN
   INSERT INTO public.instructor_requests(student_id,beach_id,level,language,meetings,total_hours,price_version_id)
   VALUES('00000000-0000-0000-0000-0000000000b1',beach,'first_time','Português',slots,1,pricing);
   RAISE EXCEPTION 'Active simultaneous request was not blocked';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
ROLLBACK;
