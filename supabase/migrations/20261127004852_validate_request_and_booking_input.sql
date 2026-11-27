-- #88/#90: official candidate generated with Supabase CLI 2.122.1 migration new.
-- Reviewed baselines only: reconciled Kitesurf and clean repository replay.
-- No automatic remote application. This is NOT a db push baseline.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE TEMP TABLE _vento90_rpc_before ON COMMIT DROP AS
SELECT expected.sig,expected.defaults,expected.definer,expected.hashes,
  p.oid,p.prosrc,p.proowner,p.proacl,p.prosecdef,p.pronargdefaults,
  p.proargdefaults::text AS argument_defaults,p.proconfig,p.prolang,p.prorettype,
  p.proargtypes,p.proargnames
FROM (VALUES
  ('public.create_booking(uuid,public.lesson_level,text,jsonb,text,boolean)',0,true,
    ARRAY['de6a7dbe9b6f248302a1a3f609f73a78']),
  ('public.create_booking(uuid,public.lesson_level,text,jsonb,text)',1,false,
    ARRAY['290345b195f7406d07feaf15770cdf89']),
  ('public.create_instructor_request(uuid,public.lesson_level,text,jsonb,text,boolean)',2,true,
    ARRAY['df9cac2742faa9d85a8fa642ae0ec973','14ef3d895388922d70c1d6b8a4011d94']),
  ('public.create_instructor_request_with_preference(uuid,public.lesson_level,text,jsonb,text,boolean,uuid)',0,true,
    ARRAY['23129c2ae7fe5769c240019620fd62f6','83caadaf0eaf8eb7f2dd56eb0c852043'])
) AS expected(sig,defaults,definer,hashes)
LEFT JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(expected.sig);

DO $preflight$
DECLARE r record; anchor constant text := E'begin\n  if price.id is null then';
BEGIN
  IF current_user<>'postgres' THEN
    RAISE EXCEPTION 'Request input migration requires postgres owner';
  END IF;
  IF to_regprocedure('public.validate_booking_input(uuid,public.lesson_level,text,jsonb)') IS NOT NULL
    OR to_regprocedure('public.guard_request_input()') IS NOT NULL
    OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.instructor_requests'::regclass
      AND tgname='request_00_input_guard') THEN
    RAISE EXCEPTION 'Request input helpers already exist; reconcile explicitly';
  END IF;
  FOR r IN SELECT * FROM _vento90_rpc_before LOOP
    IF r.oid IS NULL OR NOT(md5(r.prosrc)=ANY(r.hashes))
      OR r.proowner<>'postgres'::regrole
      OR r.prosecdef IS DISTINCT FROM r.definer
      OR r.pronargdefaults IS DISTINCT FROM r.defaults
      OR r.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
      OR NOT has_function_privilege('authenticated',r.oid,'EXECUTE')
      OR has_function_privilege('anon',r.oid,'EXECUTE')
      OR (SELECT array_agg(a.grantee::regrole::text ORDER BY a.grantee::regrole::text)
        FROM aclexplode(coalesce(r.proacl,acldefault('f',r.proowner))) a)
        IS DISTINCT FROM (CASE WHEN to_regrole('service_role') IS NULL
          THEN ARRAY['authenticated','postgres']::text[]
          ELSE ARRAY['authenticated','postgres','service_role']::text[] END)
      OR EXISTS(SELECT 1 FROM aclexplode(coalesce(r.proacl,acldefault('f',r.proowner))) a
        WHERE a.grantor<>'postgres'::regrole OR a.privilege_type<>'EXECUTE' OR a.is_grantable)
      OR EXISTS(SELECT 1 FROM aclexplode(coalesce(r.proacl,acldefault('f',r.proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE') THEN
      RAISE EXCEPTION 'Unreviewed request input baseline: %',r.sig;
    END IF;
    IF r.definer AND
      length(r.prosrc)-length(replace(r.prosrc,anchor,''))<>length(anchor) THEN
      RAISE EXCEPTION 'Unexpected validation anchor: %',r.sig;
    END IF;
  END LOOP;
END $preflight$;

LOCK TABLE public.bookings,public.instructor_requests IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION public.validate_booking_input(
  p_student uuid, p_level public.lesson_level, p_language text, p_meetings jsonb
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $$
DECLARE slot jsonb; lvl public.lesson_level; h numeric; ts timestamptz;
BEGIN
  IF p_student IS DISTINCT FROM auth.uid() OR p_student IS NULL THEN
    RAISE EXCEPTION 'Invalid student' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(assessed_kite_level,self_reported_kite_level) INTO lvl
    FROM public.profiles WHERE id=p_student AND role='student';
  IF lvl IS NULL OR p_level IS NULL OR
    (lvl='returning' AND p_level='first_time') OR
    (lvl='improving' AND p_level<>'improving') THEN
    RAISE EXCEPTION 'Lesson level is not eligible' USING ERRCODE='22023';
  END IF;
  IF p_language IS NULL OR p_language NOT IN ('Português','Inglês','Espanhol','Francês','Alemão','Italiano') THEN
    RAISE EXCEPTION 'Invalid language' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_meetings) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid meetings' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_meetings) NOT BETWEEN 1 AND 8 THEN
    RAISE EXCEPTION 'Invalid meeting count' USING ERRCODE='22023';
  END IF;
  FOR slot IN SELECT value FROM jsonb_array_elements(p_meetings) LOOP
    IF jsonb_typeof(slot) IS DISTINCT FROM 'object'
      OR jsonb_typeof(slot->'hours') IS DISTINCT FROM 'number'
      OR jsonb_typeof(slot->'starts_at') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Invalid meeting fields' USING ERRCODE='22023';
    END IF;
    BEGIN
      h := (slot->>'hours')::numeric;
      ts := (slot->>'starts_at')::timestamptz;
    EXCEPTION WHEN data_exception THEN
      RAISE EXCEPTION 'Invalid meeting date or hours' USING ERRCODE='22023';
    END;
    IF h NOT BETWEEN 1 AND 8 OR h<>trunc(h) OR NOT isfinite(ts)
      OR ts < now()+interval '1 hour' THEN
      RAISE EXCEPTION 'Invalid meeting date or hours' USING ERRCODE='22023';
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.validate_booking_input(uuid,public.lesson_level,text,jsonb) FROM PUBLIC,anon,authenticated;

DO $patch$
DECLARE r record; definition text; anchor constant text := E'begin\n  if price.id is null then';
  replacement constant text := E'begin\n  perform public.validate_booking_input(uid,p_level,p_language,p_meetings);\n  if price.id is null then';
BEGIN
  FOR r IN SELECT * FROM _vento90_rpc_before WHERE definer LOOP
    -- Recheck all catalog metadata after taking the short table locks.
    IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=r.oid AND p.prosrc=r.prosrc
      AND p.proowner=r.proowner AND p.proacl IS NOT DISTINCT FROM r.proacl
      AND p.prosecdef=r.prosecdef AND p.pronargdefaults=r.pronargdefaults
      AND p.proargdefaults::text IS NOT DISTINCT FROM r.argument_defaults
      AND p.proconfig IS NOT DISTINCT FROM r.proconfig) THEN
      RAISE EXCEPTION 'RPC drift after preflight: %',r.sig;
    END IF;
    definition := pg_get_functiondef(r.oid);
    IF length(definition)-length(replace(definition,anchor,''))<>length(anchor) THEN
      RAISE EXCEPTION 'Unexpected function definition anchor: %',r.sig;
    END IF;
    EXECUTE replace(definition,anchor,replacement);
  END LOOP;
END $patch$;

CREATE OR REPLACE FUNCTION public.guard_request_input()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE slot jsonb; profile_level public.lesson_level;
BEGIN
  IF NEW.language IS NULL OR NEW.language NOT IN ('Português','Inglês','Espanhol','Francês','Alemão','Italiano') THEN
    RAISE EXCEPTION 'Invalid language' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(p.assessed_kite_level,p.self_reported_kite_level) INTO profile_level
    FROM public.profiles p WHERE p.id=NEW.student_id AND p.role='student';
  IF profile_level IS NULL OR NEW.level IS NULL
    OR (profile_level='returning' AND NEW.level='first_time')
    OR (profile_level='improving' AND NEW.level<>'improving') THEN
    RAISE EXCEPTION 'Lesson level is not eligible for this student' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(NEW.meetings) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid meetings' USING ERRCODE='22023';
  END IF;
  FOR slot IN SELECT value FROM pg_catalog.jsonb_array_elements(NEW.meetings) LOOP
    IF jsonb_typeof(slot) IS DISTINCT FROM 'object' OR nullif(btrim(slot->>'starts_at'),'') IS NULL
      OR nullif(btrim(slot->>'hours'),'') IS NULL THEN
      RAISE EXCEPTION 'Meeting date and hours are required' USING ERRCODE='22023';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_request_input() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER request_00_input_guard BEFORE INSERT ON public.instructor_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_request_input();

DO $postflight$
DECLARE r record; expected_body text;
  anchor constant text := E'begin\n  if price.id is null then';
  replacement constant text := E'begin\n  perform public.validate_booking_input(uid,p_level,p_language,p_meetings);\n  if price.id is null then';
BEGIN
  FOR r IN SELECT * FROM _vento90_rpc_before LOOP
    expected_body := CASE WHEN r.definer THEN replace(r.prosrc,anchor,replacement) ELSE r.prosrc END;
    IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=r.oid AND p.prosrc=expected_body
      AND p.proowner=r.proowner AND p.proacl IS NOT DISTINCT FROM r.proacl
      AND p.prosecdef=r.prosecdef AND p.pronargdefaults=r.pronargdefaults
      AND p.proargdefaults::text IS NOT DISTINCT FROM r.argument_defaults
      AND p.proconfig IS NOT DISTINCT FROM r.proconfig AND p.prolang=r.prolang
      AND p.prorettype=r.prorettype AND p.proargtypes=r.proargtypes
      AND p.proargnames IS NOT DISTINCT FROM r.proargnames) THEN
      RAISE EXCEPTION 'RPC metadata/body changed unexpectedly: %',r.sig;
    END IF;
  END LOOP;
  IF has_function_privilege('anon','public.validate_booking_input(uuid,public.lesson_level,text,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.validate_booking_input(uuid,public.lesson_level,text,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.guard_request_input()','EXECUTE')
    OR has_function_privilege('authenticated','public.guard_request_input()','EXECUTE') THEN
    RAISE EXCEPTION 'Internal request helpers unexpectedly exposed';
  END IF;
END $postflight$;
NOTIFY pgrst,'reload schema';
COMMIT;

