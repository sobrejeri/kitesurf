-- #91: increasing a buffer cannot invalidate an accepted pending reservation.
-- Disposable fixtures only, all setup and assertions rolled back.
\set ON_ERROR_STOP on
BEGIN;
UPDATE public.bookings SET status='cancelled',cancelled_at=now() WHERE status='awaiting_payment';
DO $buffer$
DECLARE
 a1 constant uuid:='00000000-0000-0000-0000-0000000000a1';
 b1 constant uuid:='00000000-0000-0000-0000-0000000000b1';
 b2 constant uuid:='00000000-0000-0000-0000-0000000000b2';
 beach uuid; st timestamptz; pending uuid; confirmed uuid; days jsonb;
 before_pending jsonb; before_confirmed jsonb; refused boolean:=false;
BEGIN
 SELECT id INTO STRICT beach FROM public.beaches WHERE slug='jeri';
 SELECT jsonb_agg(jsonb_build_object('weekday',d,'opens','08:00','closes','20:00')) INTO days FROM generate_series(0,6) d;
 PERFORM set_config('request.jwt.claim.sub',a1::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM public.save_my_weekly_schedule(days,0);
 EXECUTE 'RESET ROLE';
 SELECT t INTO st FROM (
  SELECT ((now() AT TIME ZONE 'America/Fortaleza')::date+d+time '10:00') AT TIME ZONE 'America/Fortaleza' t
  FROM generate_series(40,150) d) q
 WHERE public.instructor_can_attend(a1,jsonb_build_array(jsonb_build_object('starts_at',t,'hours',1),
   jsonb_build_object('starts_at',t+interval '2 hours','hours',1)))
 AND NOT public.student_has_meeting_overlap(b1,t,60)
 AND NOT public.student_has_meeting_overlap(b2,t+interval '2 hours',60)
 ORDER BY t LIMIT 1;
 ASSERT st IS NOT NULL,'no synthetic buffer pair available';
 PERFORM set_config('request.jwt.claim.sub',b1::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
 pending:=public.create_booking(beach,'first_time','Português',jsonb_build_array(jsonb_build_object('starts_at',st,'hours',1)));
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',b2::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
 confirmed:=public.create_booking(beach,'first_time','Português',jsonb_build_array(jsonb_build_object('starts_at',st+interval '2 hours','hours',1)));
 PERFORM public.confirm_test_payment(confirmed);
 EXECUTE 'RESET ROLE';
 SELECT to_jsonb(b) INTO before_pending FROM public.bookings b WHERE id=pending;
 SELECT to_jsonb(b) INTO before_confirmed FROM public.bookings b WHERE id=confirmed;
 BEGIN
  PERFORM set_config('request.jwt.claim.sub',a1::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.save_my_weekly_schedule(days,120);
 EXCEPTION WHEN SQLSTATE '55000' THEN
  ASSERT SQLERRM LIKE 'A pending reservation%',SQLERRM; refused:=true;
 END;
 EXECUTE 'RESET ROLE';
 ASSERT refused,'buffer increase invalidated a pending booking';
 ASSERT (SELECT buffer_minutes FROM public.instructor_schedule_settings WHERE instructor_id=a1)=0,'buffer change must roll back';
 ASSERT (SELECT to_jsonb(b) FROM public.bookings b WHERE id=pending)=before_pending,'pending snapshot preserved';
 ASSERT (SELECT to_jsonb(b) FROM public.bookings b WHERE id=confirmed)=before_confirmed,'confirmed snapshot preserved';
 ASSERT NOT EXISTS(SELECT 1 FROM public.audit_logs WHERE action='booking.hold_cancelled_availability' AND entity_id=pending::text),'no automatic cancellation audit';
END $buffer$;
ROLLBACK;
SELECT 'PASS: incompatible buffer change refused; pending and confirmed bookings preserved' AS result;

