-- Read-only catalog preflight/postflight. No booking/user rows or credentials.
SELECT p.oid,p.oid::regprocedure AS signature,md5(p.prosrc) AS body_md5,
  CASE md5(p.prosrc)
    WHEN 'b14c82bf96cd041fb2d00fd5a8a1f3f3' THEN 'observed baseline: guard absent'
    WHEN '8612883273a948c7bbe54ac9f7851ccb' THEN 'repository baseline: guard absent'
    WHEN '7ec941f10a25a01701aa14cb0d89b8a1' THEN 'observed baseline: guard installed'
    WHEN 'b46dc7bf48c3c82b4ec5bc39a86067ec' THEN 'repository baseline: guard installed'
    ELSE 'UNKNOWN: stop and review drift' END AS state,
  pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,p.proacl,
  p.proargtypes::text,p.proargnames,p.pronargdefaults,pg_get_expr(p.proargdefaults,0) AS defaults,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p WHERE p.oid=to_regprocedure('public.confirm_test_payment(uuid)');
-- Capture BEFORE any authorized deployment, outside Git, to prepare rollback:
-- SELECT pg_get_functiondef('public.confirm_test_payment(uuid)'::regprocedure);
-- The migration changes only prosrc. Replacing the function with that captured
-- declaration restores its body, while retaining its existing OID/owner/ACL.
