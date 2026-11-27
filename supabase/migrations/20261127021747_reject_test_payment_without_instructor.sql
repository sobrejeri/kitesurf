-- CLI 2.122.1 migration new reject_test_payment_without_instructor.
-- No data writes, grants, payment provider calls or lock-order promotion.
-- Recognize only the observed hosted body and the repository replay body;
-- insert one state guard into whichever known baseline is actually present.
BEGIN;
DO $migration$
DECLARE
  target oid := to_regprocedure('public.confirm_test_payment(uuid)');
  original_body text; original_definition text; original_metadata jsonb;
  patched_body text; actual_body text; actual_metadata jsonb;
  marker constant text := E'  if b.status <> ''awaiting_payment'' then\n';
  guard constant text := E'  if b.instructor_id is null then\n    raise exception ''Booking has no instructor'' using errcode = ''55000'';\n  end if;\n';
BEGIN
  SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc'
    INTO original_body,original_definition,original_metadata
    FROM pg_proc p WHERE p.oid=target;
  IF target IS NULL OR md5(original_body) NOT IN
    ('b14c82bf96cd041fb2d00fd5a8a1f3f3','8612883273a948c7bbe54ac9f7851ccb') THEN
    RAISE EXCEPTION 'confirm_test_payment baseline drift; capture and review before applying' USING ERRCODE='55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
    WHERE p.oid=target AND p.proowner='postgres'::regrole
      AND p.prosecdef AND NOT p.proisstrict AND NOT p.proleakproof
      AND p.prokind='f' AND p.provolatile='v' AND p.proparallel='u'
      AND l.lanname='plpgsql' AND p.prorettype='void'::regtype
      AND p.proargtypes='2950'::oidvector AND p.proargnames=ARRAY['p_booking_id']
      AND p.pronargdefaults=0 AND p.proargdefaults IS NULL
      AND p.proconfig=ARRAY['search_path=""']
  ) THEN
    RAISE EXCEPTION 'confirm_test_payment metadata drift' USING ERRCODE='55000';
  END IF;
  -- Only the known executor roles may appear, without grant options. The
  -- managed service_role entry may be absent in a plain PostgreSQL replay.
  IF EXISTS (
    SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.oid=target AND (a.grantee=0 OR a.grantee NOT IN
      (SELECT oid FROM pg_roles WHERE rolname IN ('postgres','authenticated','service_role'))
      OR a.grantor<>'postgres'::regrole OR a.privilege_type<>'EXECUTE' OR a.is_grantable)
  ) OR NOT has_function_privilege('authenticated',target,'EXECUTE') THEN
    RAISE EXCEPTION 'confirm_test_payment ACL drift' USING ERRCODE='55000';
  END IF;
  IF (length(original_body)-length(replace(original_body,marker,'')))<>length(marker) THEN
    RAISE EXCEPTION 'confirm_test_payment insertion point drift' USING ERRCODE='55000';
  END IF;
  patched_body:=replace(original_body,marker,guard||marker);
  -- pg_get_functiondef preserves the exact declaration; only its known body
  -- is replaced. CREATE OR REPLACE keeps its OID, owner and existing ACL.
  EXECUTE replace(original_definition,original_body,patched_body);
  SELECT p.prosrc,to_jsonb(p)-'prosrc' INTO actual_body,actual_metadata
    FROM pg_proc p WHERE p.oid=target;
  IF actual_body IS DISTINCT FROM patched_body OR actual_metadata IS DISTINCT FROM original_metadata THEN
    RAISE EXCEPTION 'confirm_test_payment postflight failed; transaction rolled back' USING ERRCODE='55000';
  END IF;
END $migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
