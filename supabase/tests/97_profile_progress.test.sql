-- A private profile may be queried for COMPLETION by the owner or admin,
-- without exposing values. Other instructors/students may not inspect it.
\set ON_ERROR_STOP on

create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',uid,false);
  execute 'set role authenticated';
end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',false);
end $$;

do $$
declare
  teacher uuid:='00000000-0000-0000-0000-0000000000a1';
  result jsonb;
begin
  perform pg_temp.act_as(teacher::text);
  result:=public.get_instructor_profile_progress(teacher);
  assert jsonb_typeof(result)='object','flags must be an object';
  assert (result->>'fullName')::boolean,'instructor name is filled';
  assert (result->>'beaches')::boolean,'instructor beaches are filled';
  assert not (result->>'phone')::boolean,'missing phone is marked incomplete';
  assert not (result->>'payout')::boolean,'payout is not guessed';
  assert not result ? 'pix_key','RPC never reveals payout secrets';
  assert not result ? 'email','RPC never reveals private email';
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
  begin
    perform public.get_instructor_profile_progress(teacher);
    raise exception 'One instructor read another instructor completion';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
  begin
    perform public.get_instructor_profile_progress(teacher);
    raise exception 'Student read instructor completion';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
  result:=public.get_instructor_profile_progress(teacher);
  assert jsonb_typeof(result)='object' and result ? 'bio',
    'Admin sees field presence flags';
  assert (select count(*) from public.instructor_private_profiles where id=teacher)=0,
    'Admin cannot read actual private profile fields';
  perform pg_temp.reset();
end $$;
