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

-- Deterministic coverage: the same isolated synthetic student explicitly visits
-- every profile level, both self-report and assessment taking precedence.
-- Each successful booking is rolled back before the next matrix cell.
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(
  '00000000-0000-0000-0000-000000009090',
  'request-guard-matrix@example.invalid',
  '{"full_name":"Request guard matrix","kite_level":"first_time"}'
);
DO $valid_rpc_matrix$
DECLARE
  student constant uuid := '00000000-0000-0000-0000-000000009090';
  instructor constant uuid := '00000000-0000-0000-0000-0000000000a1';
  beach uuid;
  first_slot timestamptz;
  second_slot timestamptz;
  slots jsonb;
  profile_level public.lesson_level;
  lesson_level public.lesson_level;
  assessed boolean;
  rpc text;
  should_reject boolean;
  msg text;
  returned_id uuid;
  booking_id uuid;
  offer_id uuid;
  assigned uuid;
  booking_row public.bookings;
  price_row public.price_versions;
  expected_rate integer;
  accepted integer := 0;
  denied integer := 0;
  before_counts jsonb;
  after_counts jsonb;
BEGIN
  SELECT id INTO STRICT beach FROM public.beaches WHERE slug='prea';
  -- Find two free local days with the real availability helper. No fixed-date
  -- dependence on the earlier race suite, no trigger disabling or fake RPC.
  WITH candidates AS (
    SELECT (date_trunc('day',now() AT TIME ZONE 'America/Fortaleza')
      +make_interval(days=>d,hours=>h)) AT TIME ZONE 'America/Fortaleza' st
    FROM generate_series(21,60) d CROSS JOIN generate_series(8,14) h
  ), available AS (
    SELECT st,(st AT TIME ZONE 'America/Fortaleza')::date local_day
    FROM candidates c
    WHERE public.instructor_can_attend(instructor,
      jsonb_build_array(jsonb_build_object('starts_at',st,'hours',2)))
    AND NOT EXISTS (
      SELECT 1 FROM public.instructor_offers o
      JOIN public.instructor_requests r ON r.id=o.request_id
      CROSS JOIN LATERAL jsonb_array_elements(r.meetings) m
      WHERE o.instructor_id=instructor AND o.status='offered'
        AND o.expires_at>now() AND r.status='searching'
        AND tstzrange((m->>'starts_at')::timestamptz,
          (m->>'starts_at')::timestamptz+make_interval(hours=>(m->>'hours')::integer),'[)')
          && tstzrange(c.st,c.st+interval '2 hours','[)')
    )
  )
  SELECT a.st,b.st INTO first_slot,second_slot
  FROM available a JOIN available b ON b.local_day>a.local_day
  WHERE public.instructor_can_attend(instructor,jsonb_build_array(
    jsonb_build_object('starts_at',a.st,'hours',2),
    jsonb_build_object('starts_at',b.st,'hours',2)))
  ORDER BY a.st,b.st LIMIT 1;
  IF first_slot IS NULL THEN RAISE EXCEPTION 'No eligible two-day fixture'; END IF;
  slots := jsonb_build_array(jsonb_build_object('starts_at',first_slot,'hours',2),
    jsonb_build_object('starts_at',second_slot,'hours',2));
  SELECT jsonb_build_array(
    (SELECT count(*) FROM public.bookings),(SELECT count(*) FROM public.booking_meetings),
    (SELECT count(*) FROM public.instructor_requests),(SELECT count(*) FROM public.instructor_offers),
    (SELECT count(*) FROM public.audit_logs)) INTO before_counts;

  FOREACH assessed IN ARRAY ARRAY[false,true] LOOP
    FOREACH profile_level IN ARRAY enum_range(NULL::public.lesson_level) LOOP
      UPDATE public.profiles SET
        self_reported_kite_level=CASE WHEN assessed THEN
          CASE WHEN profile_level='improving' THEN 'first_time'::public.lesson_level ELSE 'improving'::public.lesson_level END
          ELSE profile_level END,
        assessed_kite_level=CASE WHEN assessed THEN profile_level ELSE NULL END
        WHERE id=student;
      FOREACH lesson_level IN ARRAY enum_range(NULL::public.lesson_level) LOOP
        should_reject := (profile_level='returning' AND lesson_level='first_time')
          OR (profile_level='improving' AND lesson_level<>'improving');
        FOREACH rpc IN ARRAY ARRAY[
          'SELECT public.create_instructor_request($1,$2,$3,$4,NULL::text,false)',
          'SELECT public.create_instructor_request_with_preference($1,$2,$3,$4,NULL::text,false,$5)',
          'SELECT public.create_booking($1,$2,$3,$4,NULL::text,false)',
          'SELECT public.create_booking($1,$2,$3,$4,NULL::text)'
        ] LOOP
          BEGIN
            PERFORM set_config('request.jwt.claim.sub',student::text,true);
            EXECUTE 'set local role authenticated';
            EXECUTE rpc INTO returned_id USING beach,lesson_level,'Português',slots,instructor;
            IF should_reject THEN
              RAISE EXCEPTION 'Ineligible level accepted: assessed=% profile=% lesson=% rpc=%',
                assessed,profile_level,lesson_level,rpc;
            END IF;
            IF returned_id IS NULL THEN RAISE EXCEPTION 'RPC returned no identity: %',rpc; END IF;
            -- Check owner visibility through RLS before using postgres to inspect.
            IF strpos(rpc,'create_instructor_request')>0 THEN
              IF NOT EXISTS(SELECT 1 FROM public.instructor_requests
                WHERE id=returned_id AND student_id=student AND level=lesson_level) THEN
                RAISE EXCEPTION 'Student cannot read its own valid request';
              END IF;
              EXECUTE 'reset role';
              SELECT id,instructor_id INTO STRICT offer_id,assigned
                FROM public.instructor_offers WHERE request_id=returned_id AND status='offered';
              PERFORM set_config('request.jwt.claim.sub',assigned::text,true);
              EXECUTE 'set local role authenticated';
              booking_id := public.accept_instructor_offer(offer_id);
              EXECUTE 'reset role';
              PERFORM set_config('request.jwt.claim.sub',student::text,true);
              EXECUTE 'set local role authenticated';
            ELSE
              booking_id := returned_id;
            END IF;
            SELECT * INTO STRICT booking_row FROM public.bookings WHERE id=booking_id;
            IF booking_row.student_id IS DISTINCT FROM student
              OR booking_row.level IS DISTINCT FROM lesson_level
              OR booking_row.total_hours IS DISTINCT FROM 4
              OR (SELECT count(*) FROM public.booking_meetings WHERE booking_id=booking_row.id)<>2
              OR (SELECT sum(minutes) FROM public.booking_meetings WHERE booking_id=booking_row.id)<>240 THEN
              RAISE EXCEPTION 'Valid 4h/2-day booking lost owner, level or duration';
            END IF;
            EXECUTE 'reset role';
            SELECT * INTO STRICT price_row FROM public.price_versions WHERE id=booking_row.price_version_id;
            expected_rate := CASE lesson_level WHEN 'first_time' THEN price_row.hourly_rate_cents
              WHEN 'returning' THEN coalesce(price_row.intermediate_hourly_cents,price_row.hourly_rate_cents)
              WHEN 'improving' THEN coalesce(price_row.advanced_hourly_cents,price_row.hourly_rate_cents) END;
            IF booking_row.hourly_rate_cents IS DISTINCT FROM expected_rate
              OR booking_row.total_cents IS DISTINCT FROM expected_rate*4
              OR booking_row.total_cents IS DISTINCT FROM
                booking_row.partner_cents+booking_row.platform_cents+booking_row.instructor_net_cents THEN
              RAISE EXCEPTION 'Valid booking pricing/split snapshot diverged';
            END IF;
            accepted := accepted+1;
            -- Roll back this successful case, including offers and audit rows.
            RAISE SQLSTATE 'ZT001' USING MESSAGE='rollback successful matrix case';
          EXCEPTION
            WHEN SQLSTATE 'ZT001' THEN NULL;
            WHEN invalid_parameter_value THEN
              GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
              IF NOT should_reject OR msg IS DISTINCT FROM 'Lesson level is not eligible' THEN RAISE; END IF;
              denied := denied+1;
          END;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
  IF accepted<>48 OR denied<>24 THEN
    RAISE EXCEPTION 'Incomplete valid/level matrix: accepted %, denied %',accepted,denied;
  END IF;
  SELECT jsonb_build_array(
    (SELECT count(*) FROM public.bookings),(SELECT count(*) FROM public.booking_meetings),
    (SELECT count(*) FROM public.instructor_requests),(SELECT count(*) FROM public.instructor_offers),
    (SELECT count(*) FROM public.audit_logs)) INTO after_counts;
  IF before_counts IS DISTINCT FROM after_counts THEN
    RAISE EXCEPTION 'Level matrix left residual rows: % -> %',before_counts,after_counts;
  END IF;
  RAISE NOTICE 'PASS: deterministic self-reported/assessed level matrix; 48 valid 4h bookings, 24 denied; all four RPCs; no residual rows';
END $valid_rpc_matrix$;

ROLLBACK;
