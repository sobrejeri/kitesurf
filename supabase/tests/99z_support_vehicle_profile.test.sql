\set ON_ERROR_STOP on
-- Disposable PostgreSQL only. Claims simulate roles, not browser authentication.
BEGIN;
DO $vehicle_test$
DECLARE
  a1 uuid := '00000000-0000-0000-0000-0000000000a1';
  a2 uuid := '00000000-0000-0000-0000-0000000000a2';
  forbidden uuid;
  invalid record;
  before_instructors text;
  before_prices text;
  before_bookings text;
  before_audits bigint;
BEGIN
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.instructor_support_vehicles'::regclass);
  ASSERT has_table_privilege('authenticated','public.instructor_support_vehicles','SELECT');
  ASSERT NOT has_table_privilege('authenticated','public.instructor_support_vehicles','INSERT');
  ASSERT NOT has_table_privilege('authenticated','public.instructor_support_vehicles','UPDATE');
  ASSERT NOT has_table_privilege('authenticated','public.instructor_support_vehicles','DELETE');
  ASSERT NOT has_table_privilege('anon','public.instructor_support_vehicles','SELECT');
  ASSERT NOT has_function_privilege('anon','public.save_my_support_vehicle(text,text,integer)','EXECUTE');
  ASSERT has_function_privilege('authenticated','public.save_my_support_vehicle(text,text,integer)','EXECUTE');
  SELECT md5(coalesce(jsonb_agg(to_jsonb(i) ORDER BY id)::text,'[]')) INTO before_instructors FROM public.instructors i;
  SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'[]')) INTO before_prices FROM public.price_versions p;
  SELECT md5(coalesce(jsonb_agg(to_jsonb(b) ORDER BY id)::text,'[]')) INTO before_bookings FROM public.bookings b;
  SELECT count(*) INTO before_audits FROM public.audit_logs WHERE action='instructor.support_vehicle_saved';

  PERFORM set_config('request.jwt.claim.sub',a1::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.save_my_support_vehicle('buggy','  Buggy azul  ',3);
  ASSERT (SELECT description FROM public.instructor_support_vehicles WHERE instructor_id=a1)='Buggy azul';
  ASSERT (SELECT passenger_capacity FROM public.instructor_support_vehicles WHERE instructor_id=a1)=3;
  PERFORM public.save_my_support_vehicle('suv','SUV branco',5);
  ASSERT (SELECT count(*) FROM public.instructor_support_vehicles)=1,'One vehicle per instructor';
  ASSERT (SELECT passenger_capacity FROM public.instructor_support_vehicles WHERE instructor_id=a1)=5;
  FOR invalid IN SELECT * FROM (VALUES
    ('boat','Description',3), (NULL::text,'Description',3), ('car',NULL::text,3),
    ('car',' ',3), ('car',repeat('x',81),3), ('car','Description',0),
    ('car','Description',21), ('car','Description',NULL::integer)
  ) AS cases(kind,description,capacity) LOOP
    BEGIN
      PERFORM public.save_my_support_vehicle(invalid.kind,invalid.description,invalid.capacity);
      RAISE EXCEPTION 'Invalid vehicle input accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  END LOOP;
  BEGIN
    INSERT INTO public.instructor_support_vehicles VALUES(a2,'car','Forged vehicle',4,now(),now());
    RAISE EXCEPTION 'Direct insert accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.instructor_support_vehicles SET passenger_capacity=20 WHERE instructor_id=a1;
    RAISE EXCEPTION 'Direct update accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.instructor_support_vehicles WHERE instructor_id=a1;
    RAISE EXCEPTION 'Direct delete accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claim.sub',a2::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ASSERT NOT EXISTS(SELECT 1 FROM public.instructor_support_vehicles WHERE instructor_id=a1),'Other owner is private';
  PERFORM public.save_my_support_vehicle('van','Van cinza',12);
  ASSERT (SELECT count(*) FROM public.instructor_support_vehicles)=1,'Owner reads only their row';
  ASSERT (SELECT instructor_id FROM public.instructor_support_vehicles)=a2,'Owner derives from Auth, not a parameter';
  EXECUTE 'RESET ROLE';

  FOREACH forbidden IN ARRAY ARRAY[
    '00000000-0000-0000-0000-0000000000b1'::uuid,
    '00000000-0000-0000-0000-0000000000c1'::uuid,
    '00000000-0000-0000-0000-00000000000a'::uuid
  ] LOOP
    PERFORM set_config('request.jwt.claim.sub',forbidden::text,true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      PERFORM public.save_my_support_vehicle('car','Unauthorized vehicle',4);
      RAISE EXCEPTION 'Student, affiliate or admin wrote owner-only metadata';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    IF forbidden='00000000-0000-0000-0000-00000000000a'::uuid THEN
      ASSERT (SELECT count(*) FROM public.instructor_support_vehicles)=2,'Admin read oversight';
    ELSE
      ASSERT (SELECT count(*) FROM public.instructor_support_vehicles)=0,'Other role sees no vehicle';
    END IF;
    EXECUTE 'RESET ROLE';
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub','',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.save_my_support_vehicle('car','No identity',4);
    RAISE EXCEPTION 'Missing identity accepted';
  EXCEPTION WHEN invalid_authorization_specification THEN NULL; END;
  EXECUTE 'RESET ROLE';

  ASSERT (SELECT passenger_capacity FROM public.instructor_support_vehicles WHERE instructor_id=a1)=5,'Rejected writes leave saved values intact';
  ASSERT (SELECT count(*) FROM public.audit_logs WHERE action='instructor.support_vehicle_saved')=before_audits+3,'Every accepted save audited once';
  ASSERT EXISTS(SELECT 1 FROM public.audit_logs WHERE action='instructor.support_vehicle_saved'
    AND actor_id=a1 AND entity_id=a1::text AND previous_state->>'passenger_capacity'='3'
    AND new_state->>'passenger_capacity'='5'),'Audit records the correct before/after owner row';
  ASSERT (SELECT md5(coalesce(jsonb_agg(to_jsonb(i) ORDER BY id)::text,'[]')) FROM public.instructors i)=before_instructors,'Legacy eligibility flag and instructor data unchanged';
  ASSERT (SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'[]')) FROM public.price_versions p)=before_prices,'Global prices unchanged';
  ASSERT (SELECT md5(coalesce(jsonb_agg(to_jsonb(b) ORDER BY id)::text,'[]')) FROM public.bookings b)=before_bookings,'Booking snapshots unchanged';
END $vehicle_test$;
ROLLBACK;
SELECT 'PASS: vehicle ownership, RLS, grants, validation, one-row upsert and audit; existing pricing/eligibility/bookings untouched' AS result;
