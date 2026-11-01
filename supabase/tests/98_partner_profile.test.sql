-- Partner profile security / completeness / admin approval, after core fixture.
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
  v_owner_id uuid:='00000000-0000-0000-0000-0000000000c1';
  admin_id uuid:='00000000-0000-0000-0000-00000000000a';
  student_id uuid:='00000000-0000-0000-0000-0000000000b1';
  pid uuid;
  beach_id uuid;
  flags jsonb;
  details jsonb;
begin
  select p.id,p.beach_id into pid,beach_id from public.partners p where p.owner_id=v_owner_id;
  assert pid is not null,'requires partner fixture';

  perform pg_temp.act_as(v_owner_id::text);
  flags:=public.get_partner_profile_progress(pid);
  assert (flags->>'name')::boolean,'business name present';
  assert (flags->>'phone')::boolean,'contact phone provided';
  assert (flags->>'responsible')::boolean,'responsible name provided';
  assert (flags->>'address')::boolean,'street address provided';
  assert not (flags->>'payout')::boolean,'empty payout is optional, never guessed';
  begin
    perform public.get_partner_admin_details(pid);
    raise exception 'Partner read admin-only contact endpoint';
  exception when insufficient_privilege then null; end;
  begin
    perform public.update_my_partner_profile(
      'Unreviewed Rename',beach_id,'Recepção Mar e Vento',
      '(88) 99999-9999','Jijoca de Jericoacoara',
      'Rua da Praia, 100, Preá','@marvento'
    );
    raise exception 'Approved business name changed without review';
  exception when sqlstate '55000' then null; end;
  perform pg_temp.reset();

  perform pg_temp.act_as(student_id::text);
  begin
    perform public.get_partner_profile_progress(pid);
    raise exception 'Student read partner profile flags';
  exception when insufficient_privilege then null; end;
  begin
    perform public.get_partner_admin_details(pid);
    raise exception 'Student read partner contact';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  perform pg_temp.act_as(admin_id::text);
  details:=public.get_partner_admin_details(pid);
  assert details->>'phone'='(88) 99999-9999','admin can verify partner phone';
  assert not details ? 'pix_key','admin cannot read private payout secrets';
  assert (public.get_partner_profile_progress(pid)->>'responsible')::boolean,
    'admin may read validated completeness booleans';
  perform pg_temp.reset();

  -- Simulate incomplete new application and verify SQL enforces the gate.
  update public.partners set status='pending' where id=pid;
  update public.partner_private_profiles set phone='' where id=v_owner_id;
  perform pg_temp.act_as(admin_id::text);
  begin
    perform public.set_partner_status(pid,'approved','Contato incompleto');
    raise exception 'Approved partner without a phone';
  exception when sqlstate '55000' then null; end;
  perform pg_temp.reset();
  assert (select status from public.partners where id=pid)='pending',
    'approval failure leaves partner pending';

  perform pg_temp.act_as(v_owner_id::text);
  perform public.update_my_partner_profile(
    'Pousada Mar & Vento',beach_id,
    'Recepção Mar e Vento','(88) 99999-9999',
    'Jijoca de Jericoacoara','Rua da Praia, 100, Preá','@marvento'
  );
  perform pg_temp.reset();

  perform pg_temp.act_as(admin_id::text);
  perform public.set_partner_status(pid,'approved','Perfil e contatos conferidos');
  perform pg_temp.reset();
  assert (select status from public.partners where id=pid)='approved',
    'complete partner may be approved';

  -- Payout table cannot be read by admin or another partner.
  perform pg_temp.act_as(admin_id::text);
  assert (select count(*) from public.partner_payout_details where id=v_owner_id)=0,
    'admin sees no payout record values';
  perform pg_temp.reset();
end $$;
