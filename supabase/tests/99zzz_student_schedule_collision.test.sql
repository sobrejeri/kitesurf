-- Regression: no duplicate student slots, even across different reservations.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.as_ceara_time(p_start timestamptz) RETURNS text
LANGUAGE sql AS $fmt$
  SELECT to_char(p_start AT TIME ZONE 'America/Fortaleza',
    'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00';
$fmt$;
DO $
DECLARE
 v_student uuid:='00000000-0000-0000-0000-0000000000b2';
 v_admin uuid:='00000000-0000-0000-0000-00000000000a';
 v_teacher uuid:='00000000-0000-0000-0000-0000000000a2';
 v_beach uuid;
 v_start timestamptz;
 v_booking uuid;
 v_price bigint;
 v_request_meetings jsonb;
BEGIN
 SELECT id INTO v_beach FROM public.beaches WHERE slug='prea';
 SELECT id INTO v_price FROM public.current_price_version();
 v_start:=(((now() AT TIME ZONE 'America/Fortaleza')::date+35)::timestamp
       +interval '11 hours') AT TIME ZONE 'America/Fortaleza';

 PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 v_booking:=public.create_admin_test_booking(v_teacher,v_student,v_beach,
   jsonb_build_array(jsonb_build_object('starts_at',pg_temp.as_ceara_time(v_start),'hours',2)));
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub','',true);
 ASSERT v_booking IS NOT NULL, 'Valid first reservation should exist';

 BEGIN
   PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
   EXECUTE 'SET LOCAL ROLE authenticated';
   PERFORM public.create_admin_test_booking(v_teacher,v_student,v_beach,
     jsonb_build_array(jsonb_build_object('starts_at',pg_temp.as_ceara_time(v_start+interval '1 hour'),'hours',2)));
   RAISE EXCEPTION 'Overlapping second booking was created';
 EXCEPTION WHEN invalid_parameter_value THEN
   ASSERT position('Student already has an active meeting' in SQLERRM)>0;
 END;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub','',true);

 v_request_meetings:=jsonb_build_array(jsonb_build_object('starts_at',pg_temp.as_ceara_time(v_start),'hours',1));
 BEGIN
   INSERT INTO public.instructor_requests
      (student_id,beach_id,level,language,meetings,total_hours,price_version_id)
   VALUES(v_student,v_beach,'first_time','Português',v_request_meetings,1,v_price);
   RAISE EXCEPTION 'Request overlapped existing confirmed booking';
 EXCEPTION WHEN invalid_parameter_value THEN
   ASSERT position('Student already has an active meeting' in SQLERRM)>0;
 END;

 v_request_meetings:=jsonb_build_array(
    jsonb_build_object('starts_at',pg_temp.as_ceara_time(v_start+interval '7 days'),'hours',1));
 INSERT INTO public.instructor_requests
    (student_id,beach_id,level,language,meetings,total_hours,price_version_id)
 VALUES(v_student,v_beach,'first_time','Português',v_request_meetings,1,v_price);
 BEGIN
   INSERT INTO public.instructor_requests
      (student_id,beach_id,level,language,meetings,total_hours,price_version_id)
   VALUES(v_student,v_beach,'first_time','Português',v_request_meetings,1,v_price);
   RAISE EXCEPTION 'Second pending request overlapped the first';
 EXCEPTION WHEN invalid_parameter_value THEN
   ASSERT position('Student already has a pending request' in SQLERRM)>0;
 END;
END $$;
ROLLBACK;
