-- Run only on a disposable restored database after installing the proposal.
BEGIN;
CREATE TEMP TABLE request_guard_fixture (
  student_id uuid, level public.lesson_level, language text, meetings jsonb
);
CREATE TRIGGER fixture_guard BEFORE INSERT ON request_guard_fixture
FOR EACH ROW EXECUTE FUNCTION public.guard_request_input();
DO $$
DECLARE student uuid; lvl public.lesson_level; bad jsonb; rejected boolean; candidate public.lesson_level; expected boolean;
BEGIN
  SELECT id, coalesce(assessed_kite_level,self_reported_kite_level)
  INTO student,lvl FROM public.profiles WHERE role='student'
  AND coalesce(assessed_kite_level,self_reported_kite_level) IS NOT NULL LIMIT 1;
  IF student IS NULL THEN RAISE EXCEPTION 'Fixture requires a synthetic student'; END IF;
  INSERT INTO request_guard_fixture VALUES(student,lvl,'Português','[{"starts_at":"2030-01-01T09:00:00-03:00","hours":2}]');
  FOR bad IN SELECT value FROM jsonb_array_elements('[{"hours":2},{"starts_at":"2030-01-01T09:00:00-03:00"},{"starts_at":null,"hours":2}]') LOOP
    rejected:=false;
    BEGIN
      INSERT INTO request_guard_fixture VALUES(student,lvl,'Português',jsonb_build_array(bad));
    EXCEPTION WHEN SQLSTATE '22023' THEN rejected:=true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'Missing field accepted'; END IF;
  END LOOP;
  rejected:=false;
  BEGIN
    INSERT INTO request_guard_fixture VALUES(student,lvl,'invalid-language','[{"starts_at":"2030-01-01T09:00:00-03:00","hours":2}]');
  EXCEPTION WHEN SQLSTATE '22023' THEN rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Invalid language accepted'; END IF;
  -- Exhaustively check the policy for each profile level present in the restore.
  FOR student,lvl IN SELECT DISTINCT ON (coalesce(assessed_kite_level,self_reported_kite_level))
    id,coalesce(assessed_kite_level,self_reported_kite_level)
    FROM public.profiles WHERE role='student'
    AND coalesce(assessed_kite_level,self_reported_kite_level) IS NOT NULL
  LOOP
    FOREACH candidate IN ARRAY enum_range(NULL::public.lesson_level) LOOP
      expected := (lvl='returning' AND candidate='first_time')
        OR (lvl='improving' AND candidate<>'improving');
      rejected:=false;
      BEGIN
        INSERT INTO request_guard_fixture VALUES(student,candidate,'Português','[{"starts_at":"2030-01-01T09:00:00-03:00","hours":2}]');
      EXCEPTION WHEN SQLSTATE '22023' THEN rejected:=true;
      END;
      IF rejected IS DISTINCT FROM expected THEN
        RAISE EXCEPTION 'Level policy mismatch: % -> %',lvl,candidate;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Exercise the public RPCs under authenticated claims, not only the trigger fixture.
-- Each failure runs in a subtransaction. Unexpected SQLSTATEs are deliberately
-- not caught: cast failures/permission errors must not masquerade as validation.
DO $rpc_regression$
DECLARE
  student uuid := '00000000-0000-0000-0000-0000000000b2';
  beach uuid;
  lvl public.lesson_level;
  valid_slots jsonb;
  sample record;
  rpc text;
  msg text;
  rejected boolean;
  before_counts jsonb;
  after_counts jsonb;
  checked integer := 0;
BEGIN
  -- The patch must retain the entry-point permissions and legacy delegation.
  FOREACH rpc IN ARRAY ARRAY[
    'public.create_instructor_request(uuid,public.lesson_level,text,jsonb,text,boolean)',
    'public.create_instructor_request_with_preference(uuid,public.lesson_level,text,jsonb,text,boolean,uuid)',
    'public.create_booking(uuid,public.lesson_level,text,jsonb,text,boolean)',
    'public.create_booking(uuid,public.lesson_level,text,jsonb,text)'
  ] LOOP
    IF NOT has_function_privilege('authenticated',rpc,'EXECUTE')
      OR has_function_privilege('anon',rpc,'EXECUTE')
      OR EXISTS (
        SELECT 1 FROM pg_proc p,
          LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
        WHERE p.oid=rpc::regprocedure AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
      ) THEN
      RAISE EXCEPTION 'Unexpected RPC execution privileges: %',rpc;
    END IF;
    IF (SELECT prosecdef FROM pg_proc WHERE oid=rpc::regprocedure)
      IS DISTINCT FROM (rpc <> 'public.create_booking(uuid,public.lesson_level,text,jsonb,text)') THEN
      RAISE EXCEPTION 'Unexpected RPC security mode: %',rpc;
    END IF;
  END LOOP;
  IF has_function_privilege('authenticated',
      'public.validate_booking_input(uuid,public.lesson_level,text,jsonb)','EXECUTE')
    OR has_function_privilege('anon',
      'public.validate_booking_input(uuid,public.lesson_level,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Internal validator must not be directly executable';
  END IF;
  SELECT coalesce(assessed_kite_level,self_reported_kite_level)
    INTO STRICT lvl FROM public.profiles WHERE id=student AND role='student';
  IF lvl IS NULL THEN RAISE EXCEPTION 'Synthetic student must have a level'; END IF;
  SELECT id INTO STRICT beach FROM public.beaches WHERE slug='prea';
  valid_slots := jsonb_build_array(jsonb_build_object(
    'starts_at',now()+interval '30 days','hours',2));
  SELECT jsonb_build_array(
    (SELECT count(*) FROM public.bookings),
    (SELECT count(*) FROM public.booking_meetings),
    (SELECT count(*) FROM public.instructor_requests),
    (SELECT count(*) FROM public.instructor_offers),
    (SELECT count(*) FROM public.audit_logs)) INTO before_counts;
  PERFORM set_config('request.jwt.claim.sub',student::text,true);
  EXECUTE 'set local role authenticated';

  FOR sample IN
    SELECT * FROM (VALUES
      ('language unknown','invalid-language',lvl,valid_slots,'Invalid language'),
      ('language absent',NULL::text,lvl,valid_slots,'Invalid language'),
      ('level absent','Português',NULL::public.lesson_level,valid_slots,'Lesson level is not eligible'),
      ('meetings absent','Português',lvl,NULL::jsonb,'Invalid meetings'),
      ('meetings object','Português',lvl,'{}'::jsonb,'Invalid meetings'),
      ('meetings empty','Português',lvl,'[]'::jsonb,'Invalid meeting count'),
      ('date absent','Português',lvl,'[{"hours":2}]'::jsonb,'Invalid meeting fields'),
      ('hours absent','Português',lvl,jsonb_build_array(jsonb_build_object('starts_at',now()+interval '30 days')),'Invalid meeting fields'),
      ('date null','Português',lvl,'[{"starts_at":null,"hours":2}]'::jsonb,'Invalid meeting fields'),
      ('hours text','Português',lvl,jsonb_build_array(jsonb_build_object('starts_at',now()+interval '30 days','hours','2')),'Invalid meeting fields'),
      ('date invalid','Português',lvl,'[{"starts_at":"not-a-date","hours":2}]'::jsonb,'Invalid meeting date or hours'),
      ('date infinite','Português',lvl,'[{"starts_at":"infinity","hours":2}]'::jsonb,'Invalid meeting date or hours'),
      ('hours fractional','Português',lvl,jsonb_build_array(jsonb_build_object('starts_at',now()+interval '30 days','hours',1.5)),'Invalid meeting date or hours'),
      ('hours zero','Português',lvl,jsonb_build_array(jsonb_build_object('starts_at',now()+interval '30 days','hours',0)),'Invalid meeting date or hours'),
      ('date past','Português',lvl,jsonb_build_array(jsonb_build_object('starts_at',now()-interval '1 day','hours',2)),'Invalid meeting date or hours')
    ) AS cases(label,language,level,slots,expected_message)
  LOOP
    FOREACH rpc IN ARRAY ARRAY[
      'SELECT public.create_instructor_request($1,$2,$3,$4,NULL::text,false)',
      'SELECT public.create_instructor_request_with_preference($1,$2,$3,$4,NULL::text,false,NULL::uuid)',
      'SELECT public.create_booking($1,$2,$3,$4,NULL::text,false)',
      'SELECT public.create_booking($1,$2,$3,$4,NULL::text)'
    ] LOOP
      rejected := false;
      BEGIN
        EXECUTE rpc USING beach,sample.level,sample.language,sample.slots;
      EXCEPTION WHEN invalid_parameter_value THEN
        GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
        IF msg IS DISTINCT FROM sample.expected_message THEN
          RAISE EXCEPTION 'Wrong validation for % via %: %',sample.label,rpc,msg;
        END IF;
        rejected := true;
      END;
      IF NOT rejected THEN
        RAISE EXCEPTION 'Invalid input accepted: % via %',sample.label,rpc;
      END IF;
      checked := checked+1;
    END LOOP;
  END LOOP;
  EXECUTE 'reset role';
  SELECT jsonb_build_array(
    (SELECT count(*) FROM public.bookings),
    (SELECT count(*) FROM public.booking_meetings),
    (SELECT count(*) FROM public.instructor_requests),
    (SELECT count(*) FROM public.instructor_offers),
    (SELECT count(*) FROM public.audit_logs)) INTO after_counts;
  IF before_counts IS DISTINCT FROM after_counts THEN
    RAISE EXCEPTION 'Rejected RPC inputs left persisted rows: % -> %',before_counts,after_counts;
  END IF;
  IF checked <> 60 THEN RAISE EXCEPTION 'Incomplete RPC matrix: %',checked; END IF;
  RAISE NOTICE 'PASS: 60 invalid-input calls across four authenticated RPC signatures; no residual rows';
END $rpc_regression$;

ROLLBACK;
