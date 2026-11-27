-- #90 post-application negative verification: no DDL, no persistent writes.
-- Execute only on the authorized Kitesurf test project. All RPCs must reject
-- before any write; the transaction itself is READ ONLY as a second barrier.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15s';

DO $remote_negative$
DECLARE
  student uuid;
  lvl public.lesson_level;
  beach uuid;
  slots jsonb;
  sample record;
  rpc text;
  sig text;
  msg text;
  refused boolean;
  calls integer := 0;
  before_data text;
  after_data text;
BEGIN
  -- Do not guess a client identity if the fixture has changed.
  IF (SELECT count(*) FROM public.profiles WHERE role='student')<>1 THEN
    RAISE EXCEPTION 'Expected exactly one authorized synthetic student; select its ID explicitly before running';
  END IF;
  SELECT id,coalesce(assessed_kite_level,self_reported_kite_level)
    INTO STRICT student,lvl FROM public.profiles WHERE role='student';
  IF lvl IS NULL THEN RAISE EXCEPTION 'Synthetic student has no level'; END IF;
  SELECT id INTO STRICT beach FROM public.beaches WHERE active ORDER BY id LIMIT 1;
  slots:=jsonb_build_array(jsonb_build_object('starts_at',now()+interval '30 days','hours',2));
  FOREACH sig IN ARRAY ARRAY[
    'public.create_instructor_request(uuid,public.lesson_level,text,jsonb,text,boolean)',
    'public.create_instructor_request_with_preference(uuid,public.lesson_level,text,jsonb,text,boolean,uuid)',
    'public.create_booking(uuid,public.lesson_level,text,jsonb,text,boolean)',
    'public.create_booking(uuid,public.lesson_level,text,jsonb,text)'
  ] LOOP
    IF to_regprocedure(sig) IS NULL
      OR NOT has_function_privilege('authenticated',sig,'EXECUTE')
      OR has_function_privilege('anon',sig,'EXECUTE')
      OR NOT has_function_privilege('service_role',sig,'EXECUTE') THEN
      RAISE EXCEPTION 'RPC missing or unexpected grants: %',sig;
    END IF;
    IF (SELECT prosecdef FROM pg_proc WHERE oid=sig::regprocedure)
      IS DISTINCT FROM (sig<>'public.create_booking(uuid,public.lesson_level,text,jsonb,text)') THEN
      RAISE EXCEPTION 'Unexpected security mode: %',sig;
    END IF;
    IF EXISTS(SELECT 1 FROM pg_proc p,
        LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE p.oid=sig::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected PUBLIC execution grant: %',sig;
    END IF;
  END LOOP;
  IF has_function_privilege('authenticated','public.validate_booking_input(uuid,public.lesson_level,text,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.validate_booking_input(uuid,public.lesson_level,text,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.guard_request_input()','EXECUTE') THEN
    RAISE EXCEPTION 'Internal validator unexpectedly exposed';
  END IF;
  IF has_function_privilege('authenticated','public.start_meeting(uuid,text)','EXECUTE')
    OR has_function_privilege('anon','public.start_meeting(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'P0: direct starter was reopened';
  END IF;

  SELECT md5(jsonb_build_array(
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.bookings t),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.booking_meetings t),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.instructor_requests t),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.instructor_offers t),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.audit_logs t),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.price_versions t)
  )::text) INTO before_data;

  PERFORM set_config('request.jwt.claim.sub',student::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',student,'role','authenticated','aal','aal1')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  FOR sample IN SELECT * FROM (VALUES
    ('unknown language','invalid-language',lvl,slots,'Invalid language'),
    ('missing language',NULL::text,lvl,slots,'Invalid language'),
    ('missing level','Português',NULL::public.lesson_level,slots,'Lesson level is not eligible'),
    ('missing meetings','Português',lvl,NULL::jsonb,'Invalid meetings'),
    ('meetings object','Português',lvl,'{}'::jsonb,'Invalid meetings'),
    ('empty meetings','Português',lvl,'[]'::jsonb,'Invalid meeting count'),
    ('missing date','Português',lvl,'[{"hours":2}]'::jsonb,'Invalid meeting fields'),
    ('missing hours','Português',lvl,jsonb_build_array(jsonb_build_object('starts_at',now()+interval '30 days')),'Invalid meeting fields'),
    ('null date','Português',lvl,'[{"starts_at":null,"hours":2}]'::jsonb,'Invalid meeting fields'),
    ('text hours','Português',lvl,jsonb_build_array(jsonb_build_object('starts_at',now()+interval '30 days','hours','2')),'Invalid meeting fields'),
    ('invalid date','Português',lvl,'[{"starts_at":"not-a-date","hours":2}]'::jsonb,'Invalid meeting date or hours'),
    ('infinite date','Português',lvl,'[{"starts_at":"infinity","hours":2}]'::jsonb,'Invalid meeting date or hours'),
    ('fractional hours','Português',lvl,jsonb_build_array(jsonb_build_object('starts_at',now()+interval '30 days','hours',1.5)),'Invalid meeting date or hours'),
    ('zero hours','Português',lvl,jsonb_build_array(jsonb_build_object('starts_at',now()+interval '30 days','hours',0)),'Invalid meeting date or hours'),
    ('past date','Português',lvl,jsonb_build_array(jsonb_build_object('starts_at',now()-interval '1 day','hours',2)),'Invalid meeting date or hours')
  ) AS cases(label,language,level,meetings,expected_message) LOOP
    FOREACH rpc IN ARRAY ARRAY[
      'SELECT public.create_instructor_request($1,$2,$3,$4,NULL::text,false)',
      'SELECT public.create_instructor_request_with_preference($1,$2,$3,$4,NULL::text,false,NULL::uuid)',
      'SELECT public.create_booking($1,$2,$3,$4,NULL::text,false)',
      'SELECT public.create_booking($1,$2,$3,$4,NULL::text)'
    ] LOOP
      refused:=false;
      BEGIN
        EXECUTE rpc USING beach,sample.level,sample.language,sample.meetings;
      EXCEPTION WHEN invalid_parameter_value THEN
        GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
        IF msg IS DISTINCT FROM sample.expected_message THEN
          RAISE EXCEPTION 'Unexpected validation for % via %: %',sample.label,rpc,msg;
        END IF;
        refused:=true;
      END;
      IF NOT refused THEN RAISE EXCEPTION 'Invalid input accepted: % via %',sample.label,rpc; END IF;
      calls:=calls+1;
    END LOOP;
  END LOOP;
  EXECUTE 'RESET ROLE';
  SELECT md5(jsonb_build_array(
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.bookings t),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.booking_meetings t),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.instructor_requests t),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.instructor_offers t),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.audit_logs t),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.price_versions t)
  )::text) INTO after_data;
  IF calls<>60 OR before_data IS DISTINCT FROM after_data THEN
    RAISE EXCEPTION 'Incomplete matrix or changed snapshot: calls %, before %, after %',calls,before_data,after_data;
  END IF;
  RAISE NOTICE 'PASS: 60 negative calls in four RPCs under authenticated student claims; grants intact, direct starter closed; data hash %',after_data;
END $remote_negative$;
ROLLBACK;
SELECT 'PASS: 60 invalid calls across four authenticated student RPCs; ACL/direct-start assertions passed; READ ONLY transaction rolled back' AS result;
