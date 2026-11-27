-- READ ONLY. Run before applying the vehicle migration; an existing destination
-- requires reconciliation, never automatic reapplication. No claims/RPC writes.
BEGIN READ ONLY;
DO $preflight$
DECLARE signature text; relation_name text;
BEGIN
  IF current_setting('transaction_read_only') <> 'on' THEN RAISE EXCEPTION 'Read-only transaction required'; END IF;
  IF to_regclass('public.instructor_support_vehicles') IS NOT NULL
    OR to_regtype('public.instructor_support_vehicles') IS NOT NULL
    OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='save_my_support_vehicle') THEN
    RAISE EXCEPTION 'Vehicle destination already exists: reconcile, do not reapply';
  END IF;
  FOREACH relation_name IN ARRAY ARRAY['instructors','profiles','audit_logs'] LOOP
    IF to_regclass('public.'||relation_name) IS NULL THEN RAISE EXCEPTION 'Missing dependency: %',relation_name; END IF;
  END LOOP;
  FOREACH signature IN ARRAY ARRAY[
    'public.require_role(public.app_role[])','public.current_app_role()',
    'public.is_admin()','public.write_audit(text,text,text,jsonb,jsonb,text)',
    'pg_catalog.hashtextextended(text,bigint)','pg_catalog.pg_advisory_xact_lock(bigint)'
  ] LOOP
    IF to_regprocedure(signature) IS NULL THEN RAISE EXCEPTION 'Missing function: %',signature; END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_constraint c ON c.conrelid=a.attrelid
    WHERE a.attrelid='public.instructors'::regclass AND a.attname='id'
      AND a.atttypid='uuid'::regtype AND a.attnotnull AND NOT a.attisdropped
      AND c.contype='p' AND c.conkey=ARRAY[a.attnum]) THEN
    RAISE EXCEPTION 'Instructor id must be a non-null UUID primary key';
  END IF;
  IF NOT has_function_privilege('authenticated','public.current_app_role()','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.is_admin()','EXECUTE') THEN
    RAISE EXCEPTION 'Policy helpers unavailable to authenticated';
  END IF;
END $preflight$;
SELECT jsonb_build_object('phase','preflight','destination_absent',true,
  'instructors_primary_key',(SELECT pg_get_constraintdef(oid) FROM pg_constraint
    WHERE conrelid='public.instructors'::regclass AND contype='p'),
  'helpers',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
    'owner',r.rolname,'security_definer',p.prosecdef,'config',p.proconfig,
    'definition_hash',md5(pg_get_functiondef(p.oid))) ORDER BY p.oid::regprocedure::text)
    FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
    WHERE p.oid IN ('public.require_role(public.app_role[])'::regprocedure,
      'public.current_app_role()'::regprocedure,'public.is_admin()'::regprocedure,
      'public.write_audit(text,text,text,jsonb,jsonb,text)'::regprocedure))) AS preflight;
COMMIT;
