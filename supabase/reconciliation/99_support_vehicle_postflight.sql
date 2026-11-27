-- READ ONLY. Reusable immediately after DDL and after an authorized UI save.
-- Zero rows are expected immediately after DDL; later test saves may add rows
-- and their audit events. No vehicle description or person identity is returned.
BEGIN READ ONLY;
DO $postflight$
DECLARE privilege_name text; column_name text; target oid; rpc oid;
BEGIN
  IF current_setting('transaction_read_only') <> 'on' THEN RAISE EXCEPTION 'Read-only transaction required'; END IF;
  target:=to_regclass('public.instructor_support_vehicles');
  rpc:=to_regprocedure('public.save_my_support_vehicle(text,text,integer)');
  IF target IS NULL OR rpc IS NULL THEN RAISE EXCEPTION 'Vehicle schema incomplete'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=target) THEN RAISE EXCEPTION 'Vehicle RLS disabled'; END IF;
  IF NOT has_table_privilege('authenticated',target,'SELECT')
    OR has_table_privilege('anon',target,'SELECT') THEN RAISE EXCEPTION 'Unexpected vehicle read grants'; END IF;
  FOREACH privilege_name IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege('authenticated',target,privilege_name)
      OR has_table_privilege('anon',target,privilege_name) THEN
      RAISE EXCEPTION 'Direct client privilege forbidden: %',privilege_name;
    END IF;
  END LOOP;
  FOR column_name IN SELECT attname FROM pg_attribute WHERE attrelid=target AND attnum>0 AND NOT attisdropped LOOP
    IF has_column_privilege('authenticated',target,column_name,'INSERT')
      OR has_column_privilege('authenticated',target,column_name,'UPDATE') THEN
      RAISE EXCEPTION 'Direct column write forbidden: %',column_name;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid=target AND contype='p')<>1
    OR NOT EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=target AND a.attname='instructor_id'
      WHERE c.conrelid=target AND c.contype='p' AND c.conkey=ARRAY[a.attnum])
    OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=target AND contype='f'
      AND confrelid='public.instructors'::regclass AND confdeltype='r')
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid=target AND contype='c')<>3 THEN
    RAISE EXCEPTION 'Vehicle constraints differ from reviewed migration';
  END IF;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid=target)<>1
    OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=target
      AND polname='support_vehicle_owner_or_admin_read' AND polcmd='r'
      AND polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='authenticated')]) THEN
    RAISE EXCEPTION 'Unexpected vehicle policies';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=rpc AND prosecdef AND pronargs=3 AND pronargdefaults=0
    AND proargnames=ARRAY['p_vehicle_type','p_description','p_passenger_capacity']
    AND proconfig @> ARRAY['search_path=""'])
    OR (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='save_my_support_vehicle')<>1
    OR NOT has_function_privilege('authenticated',rpc,'EXECUTE')
    OR has_function_privilege('anon',rpc,'EXECUTE')
    OR EXISTS(SELECT 1 FROM pg_proc p,LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid=rpc AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected vehicle RPC security/signature/ACL';
  END IF;
END $postflight$;
SELECT jsonb_build_object('phase','postflight',
  'vehicle_rows',(SELECT count(*) FROM public.instructor_support_vehicles),
  'vehicle_audits',(SELECT count(*) FROM public.audit_logs WHERE action='instructor.support_vehicle_saved'),
  'rpc',(SELECT jsonb_build_object('signature',p.oid::regprocedure::text,'owner',r.rolname,
    'security_definer',p.prosecdef,'config',p.proconfig,'definition_hash',md5(pg_get_functiondef(p.oid)))
    FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
    WHERE p.oid='public.save_my_support_vehicle(text,text,integer)'::regprocedure),
  'constraints',(SELECT jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid)) ORDER BY conname)
    FROM pg_constraint WHERE conrelid='public.instructor_support_vehicles'::regclass AND contype IN ('p','f','c')),
  'policies',(SELECT jsonb_agg(jsonb_build_object('name',policyname,'roles',roles,'command',cmd,'using',qual))
    FROM pg_policies WHERE schemaname='public' AND tablename='instructor_support_vehicles')) AS postflight;
COMMIT;
