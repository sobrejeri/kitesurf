-- Migration 48: an admin acts as admin only after the second factor (aal2).
-- With e-mail and password alone (aal1) the account has no admin power.
\set ON_ERROR_STOP on

-- The token's claims, as PostgREST sets them for a request.
create function pg_temp.claims(uid text, aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.aal', aal, false);
end $$;
-- A request from that user: claims plus the client role.
create function pg_temp.act_as(uid text, aal text) returns void language plpgsql as $$
begin
  perform pg_temp.claims(uid, aal);
  execute 'set role authenticated';
end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform pg_temp.claims('', '');
end $$;

do $$
declare
  admin_id uuid := '00000000-0000-0000-0000-00000000000a';
  student_id uuid := '00000000-0000-0000-0000-0000000000b1';
  instructor_id uuid := '00000000-0000-0000-0000-0000000000a1';
  partner_id uuid := (select id from public.partners where owner_id = '00000000-0000-0000-0000-0000000000c1');
  seen integer;
begin
  -- Password only: no admin power anywhere.
  perform pg_temp.act_as(admin_id::text, 'aal1');
  assert not public.is_admin(), 'aal1 admin is not admin';
  begin
    perform public.set_partner_status(partner_id, 'pending', 'Tentativa sem segundo fator');
    raise exception 'aal1 admin changed an affiliate status';
  exception when insufficient_privilege then
    assert sqlerrm like 'Second factor required%', 'clear reason: ' || sqlerrm;
  end;
  begin
    perform public.admin_set_tax_id(instructor_id, '52998224725', 'Tentativa sem segundo fator');
    raise exception 'aal1 admin corrected a tax id';
  exception when insufficient_privilege then null; end;
  select count(*) into seen from public.account_tax_ids;
  assert seen = 0, 'aal1 admin reads no tax id';
  select count(*) into seen from public.audit_logs;
  assert seen = 0, 'aal1 admin reads no audit log';
  perform pg_temp.reset();
  assert (select status from public.partners where id = partner_id) = 'approved', 'nothing changed';

  -- require_role is only called inside database functions; check it directly.
  perform pg_temp.claims(admin_id::text, 'aal1');
  begin
    perform public.require_role(array['admin']::public.app_role[]);
    raise exception 'aal1 admin passed require_role(admin)';
  exception when insufficient_privilege then
    assert sqlerrm like 'Second factor required%', 'clear reason: ' || sqlerrm;
  end;
  begin
    perform public.require_role(array['student']::public.app_role[]);
    raise exception 'aal1 admin passed as another role';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  -- With the second factor: full admin.
  perform pg_temp.claims(admin_id::text, 'aal2');
  assert public.require_role(array['admin']::public.app_role[]) = admin_id, 'aal2 admin passes';
  perform pg_temp.reset();
  perform pg_temp.act_as(admin_id::text, 'aal2');
  assert public.is_admin(), 'aal2 admin is admin';
  select count(*) into seen from public.account_tax_ids;
  assert seen > 0, 'aal2 admin reads tax ids for verification';
  select count(*) into seen from public.audit_logs;
  assert seen > 0, 'aal2 admin reads the audit log';
  perform pg_temp.reset();

  -- Other accounts do not need the second factor.
  perform pg_temp.claims(student_id::text, 'aal1');
  assert public.require_role(array['student']::public.app_role[]) = student_id, 'student with password only';
  perform pg_temp.reset();
  perform pg_temp.claims(instructor_id::text, 'aal1');
  assert public.require_role(array['instructor']::public.app_role[]) = instructor_id, 'instructor with password only';
  perform pg_temp.reset();
  perform pg_temp.act_as(student_id::text, 'aal2');
  assert not public.is_admin(), 'a student is never admin, second factor or not';
  perform pg_temp.reset();

  -- Anything but aal2 is not a second factor (only the test stub defaults to aal2).
  perform pg_temp.act_as(admin_id::text, 'none');
  assert not public.session_has_second_factor(), 'unknown aal is not aal2';
  assert not public.is_admin(), 'unknown aal is not admin';
  perform pg_temp.reset();
end $$;

select 'PASS: admin powers require the second factor (aal2); other accounts unchanged';
