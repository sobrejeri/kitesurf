-- Disposable PostgreSQL only: claims are simulated; no real push subscription.
\set ON_ERROR_STOP on
begin;
-- The baseline stub omits sessions; provide only the columns used by this RPC.
create table if not exists auth.sessions(id uuid primary key, user_id uuid not null references auth.users(id));
insert into auth.sessions(id,user_id) values
  ('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-0000000000b1'),
  ('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-0000000000b1'),
  ('33333333-3333-4333-8333-333333333333','00000000-0000-0000-0000-0000000000b2');
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'sub', nullif(current_setting('request.jwt.claim.sub', true), ''),
    'aal', coalesce(nullif(current_setting('request.jwt.claim.aal', true), ''), 'aal2'),
    'session_id', nullif(current_setting('request.jwt.claim.session_id', true), '')
  ));
$$;
do $$
declare
  b1 constant text := '00000000-0000-0000-0000-0000000000b1';
  b2 constant text := '00000000-0000-0000-0000-0000000000b2';
  s1 constant text := '11111111-1111-4111-8111-111111111111';
  s2 constant text := '22222222-2222-4222-8222-222222222222';
  v_endpoint constant text := 'https://fcm.googleapis.com/fcm/send/synthetic-fixture';
  pk text := rtrim(translate(replace(encode(decode('04'||repeat('00',64),'hex'),'base64'), E'\n',''),'+/','-_'),'=');
  ak text := rtrim(translate(encode(decode(repeat('00',16),'hex'),'base64'),'+/','-_'),'=');
  own uuid; again uuid; second uuid; bad text; actor text; signature text; actor_session uuid;
begin
  assert not (select enabled from public.push_subscription_settings where singleton), 'database registration defaults OFF';
  assert (select relrowsecurity from pg_class where oid='public.push_subscriptions'::regclass), 'RLS required';
  foreach signature in array array[
    'public.register_my_push_subscription(text,text,text,timestamptz)',
    'public.revoke_my_push_subscription(text)', 'public.revoke_my_push_session_subscriptions()'
  ] loop
    assert has_function_privilege('authenticated',signature,'EXECUTE'), 'authenticated RPC entrypoint';
    assert not has_function_privilege('anon',signature,'EXECUTE'), 'anonymous execution denied';
    assert not exists(select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where p.oid=signature::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'), 'PUBLIC execution denied';
  end loop;
  assert not has_function_privilege('authenticated','public.validate_push_subscription_input(text,text,text)','EXECUTE'), 'validator is internal';
  execute 'set local role anon';
  begin
    perform public.register_my_push_subscription(v_endpoint,pk,ak);
    raise exception 'anonymous registration accepted';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',b1,true);
  perform set_config('request.jwt.claim.session_id',s1,true);
  execute 'set local role authenticated';
  begin
    perform public.register_my_push_subscription(v_endpoint,pk,ak);
    raise exception 'disabled registration accepted';
  exception when sqlstate '55000' then null; end;
  execute 'reset role';
  update public.push_subscription_settings set enabled=true;
  execute 'set local role authenticated';
  own := public.register_my_push_subscription(v_endpoint,pk,ak);
  again := public.register_my_push_subscription(v_endpoint,pk,ak);
  assert own=again, 'own repeated registration is idempotent';
  assert (select owner_id from public.push_subscriptions where id=own)=b1::uuid, 'owner derived from claims';
  assert (select count(id) from public.push_subscriptions where endpoint=v_endpoint)=1, 'one endpoint row';
  begin
    perform p256dh from public.push_subscriptions where id=own;
    raise exception 'client can read encryption keys';
  exception when insufficient_privilege then null; end;
  begin
    update public.push_subscriptions set owner_id=b2::uuid where id=own;
    raise exception 'direct DML allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.push_subscriptions where id=own;
    raise exception 'direct delete allowed';
  exception when insufficient_privilege then null; end;

  foreach bad in array array['http://fcm.googleapis.com/token','https://localhost/token','https://127.0.0.1/token',
    'https://evil.example/token','https://fcm.googleapis.com:444/token','https://user@fcm.googleapis.com/token',
    'https://fcm.googleapis.com/token#fragment',E'https://fcm.googleapis.com/token\n','https://fcm.googleapis.com/'||repeat('x',2048)] loop
    begin
      perform public.register_my_push_subscription(bad,pk,ak);
      raise exception 'invalid endpoint accepted: %',bad;
    exception when invalid_parameter_value then null; end;
  end loop;
  foreach bad in array array[null::text,'',repeat('A',86),repeat('A',87),left(pk,86)||'B'] loop
    begin
      perform public.register_my_push_subscription(v_endpoint,bad,ak);
      raise exception 'invalid public key accepted';
    exception when invalid_parameter_value then null; end;
  end loop;
  foreach bad in array array[null::text,'',repeat('A',21),repeat('!',22),left(ak,21)||'B'] loop
    begin
      perform public.register_my_push_subscription(v_endpoint,pk,bad);
      raise exception 'invalid authentication secret accepted';
    exception when invalid_parameter_value then null; end;
  end loop;
  begin
    perform public.register_my_push_subscription(v_endpoint,pk,ak,now()-interval '1 second');
    raise exception 'expired subscription accepted';
  exception when invalid_parameter_value then null; end;
  perform set_config('request.jwt.claim.session_id','',true);
  begin
    perform public.register_my_push_subscription(v_endpoint,pk,ak);
    raise exception 'missing session accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.session_id',s1,true);
  perform set_config('request.jwt.claim.sub',b2,true);
  begin
    perform public.register_my_push_subscription(v_endpoint||'-wrong-session',pk,ak);
    raise exception 'session belonging to another user accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.session_id','33333333-3333-4333-8333-333333333333',true);
  assert (select count(id) from public.push_subscriptions where id=own)=0, 'RLS isolates another account';
  begin
    perform public.register_my_push_subscription(v_endpoint,pk,ak);
    raise exception 'endpoint reassigned to another account';
  exception when insufficient_privilege then null; end;
  perform public.revoke_my_push_subscription(v_endpoint);
  perform public.revoke_my_push_session_subscriptions();
  execute 'reset role';
  assert (select revoked_at from public.push_subscriptions where id=own) is null, 'another account cannot revoke';

  perform set_config('request.jwt.claim.sub',b1,true);
  perform set_config('request.jwt.claim.session_id',s2,true);
  execute 'set local role authenticated';
  second := public.register_my_push_subscription(v_endpoint||'-second-session',pk,ak);
  perform set_config('request.jwt.claim.session_id',s1,true);
  perform public.revoke_my_push_session_subscriptions();
  perform public.revoke_my_push_session_subscriptions();
  execute 'reset role';
  assert (select revoked_at from public.push_subscriptions where id=own) is not null, 'logout revokes current session';
  assert (select p256dh is null and auth_secret is null from public.push_subscriptions where id=own), 'revocation clears encryption keys';
  assert (select revoked_at from public.push_subscriptions where id=second) is null, 'logout preserves another device/session';
  perform set_config('request.jwt.claim.sub',b2,true);
  perform set_config('request.jwt.claim.session_id','33333333-3333-4333-8333-333333333333',true);
  execute 'set local role authenticated';
  begin
    perform public.register_my_push_subscription(v_endpoint,pk,ak);
    raise exception 'revoked endpoint transferred between accounts';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  -- All four app profiles can register their own endpoint; Admin cannot read another owner.
  foreach actor in array array[b1,'00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000c1'] loop
    actor_session := gen_random_uuid();
    insert into auth.sessions(id,user_id) values(actor_session,actor::uuid);
    perform set_config('request.jwt.claim.sub',actor,true);
    perform set_config('request.jwt.claim.session_id',actor_session::text,true);
    execute 'set local role authenticated';
    perform public.register_my_push_subscription(v_endpoint||'-'||actor,pk,ak);
    assert not exists(select 1 from public.push_subscriptions where owner_id<>auth.uid()), 'no role bypass of owner RLS';
    execute 'reset role';
  end loop;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',true);
  perform set_config('request.jwt.claim.aal','aal1',true);
  execute 'set local role authenticated';
  begin
    perform public.register_my_push_subscription(v_endpoint||'-admin-aal1',pk,ak);
    raise exception 'admin without second factor registered push';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claim.aal','aal2',true);
  delete from auth.sessions where id=actor_session;
  assert not exists(select 1 from public.push_subscriptions where session_id=actor_session), 'Auth session deletion removes its endpoints even if application revocation failed';
  update public.push_subscription_settings set enabled=false;
  perform set_config('request.jwt.claim.sub',b1,true);
  execute 'set local role authenticated';
  perform public.revoke_my_push_subscription(v_endpoint||'-second-session');
  perform public.revoke_my_push_subscription(v_endpoint||'-second-session');
  execute 'reset role';
  assert (select revoked_at from public.push_subscriptions where id=second) is not null, 'revocation works when registration is OFF';
  assert (select count(*) from public.push_subscriptions where endpoint=v_endpoint)=1, 'rejections left no duplicate endpoint';
end $$;
rollback;
select 'PASS: push subscriptions OFF by default, four roles, canonical keys, endpoint bounds, ownership/RLS, idempotency and session-scoped revocation' as result;
