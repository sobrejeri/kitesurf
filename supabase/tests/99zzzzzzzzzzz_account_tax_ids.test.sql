-- Migration 47: CPF or CNPJ for instructors and affiliates. Private, valid,
-- unique within each kind of account, required for the first approval and
-- locked afterwards except for an audited correction by the administration.
\set ON_ERROR_STOP on

create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  execute 'set role authenticated';
end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

-- 1. Check digits, including the alphanumeric CNPJ (Receita Federal example).
do $$ begin
  assert public.tax_id_is_valid('cpf', '52998224725'), 'valid CPF';
  assert public.tax_id_is_valid('cpf', '39053344705'), 'valid CPF';
  assert not public.tax_id_is_valid('cpf', '52998224724'), 'wrong CPF check digit';
  assert not public.tax_id_is_valid('cpf', '11111111111'), 'repeated digits are not a CPF';
  assert not public.tax_id_is_valid('cpf', '5299822472'), 'short CPF';
  assert public.tax_id_is_valid('cnpj', '11222333000181'), 'valid numeric CNPJ';
  assert public.tax_id_is_valid('cnpj', '12ABC34501DE35'), 'valid alphanumeric CNPJ';
  assert not public.tax_id_is_valid('cnpj', '12ABC34501DE36'), 'wrong alphanumeric CNPJ check digit';
  assert not public.tax_id_is_valid('cnpj', '11222333000182'), 'wrong CNPJ check digit';
  assert not public.tax_id_is_valid('cnpj', '00000000000000'), 'repeated digits are not a CNPJ';
  assert not public.tax_id_is_valid('rg', '52998224725'), 'unknown kind';
  assert public.normalize_tax_id(' 12.abc.345/01de-35 ') = '12ABC34501DE35', 'punctuation and case removed';
  assert public.tax_id_kind('52998224725') = 'cpf' and public.tax_id_kind('11222333000181') = 'cnpj'
    and public.tax_id_kind('123') is null, 'kind follows the length';
end $$;

-- Fixtures: three new instructors, one new affiliate.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a4', 'a4@test', '{"full_name":"Instrutor Quatro","role":"instructor"}'),
  ('00000000-0000-0000-0000-0000000000a5', 'a5@test', '{"full_name":"Instrutor Cinco","role":"instructor"}'),
  ('00000000-0000-0000-0000-0000000000a6', 'a6@test', '{"full_name":"Instrutor Seis","role":"instructor"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'c2@test', '{"full_name":"Loja do Kite","role":"partner"}');

do $$
declare
  a1 uuid := '00000000-0000-0000-0000-0000000000a1';
  a3 uuid := '00000000-0000-0000-0000-0000000000a3';
  a4 uuid := '00000000-0000-0000-0000-0000000000a4';
  a5 uuid := '00000000-0000-0000-0000-0000000000a5';
  a6 uuid := '00000000-0000-0000-0000-0000000000a6';
  c1 uuid := '00000000-0000-0000-0000-0000000000c1';
  c2 uuid := '00000000-0000-0000-0000-0000000000c2';
  admin_id uuid := '00000000-0000-0000-0000-00000000000a';
  student_id uuid := '00000000-0000-0000-0000-0000000000b1';
  c2_partner uuid;
  flags jsonb;
begin
  -- 2. The holder saves their own number; punctuation is accepted.
  perform pg_temp.act_as(a3::text);
  perform public.set_my_tax_id('390.533.447-05');
  assert (select number from public.account_tax_ids where id = a3) = '39053344705', 'stored as digits';
  assert (select kind from public.account_tax_ids where id = a3) = 'cpf', 'kind derived from length';
  flags := public.get_instructor_profile_progress(a3);
  assert (flags ->> 'taxId')::boolean, 'progress shows the document as filled';
  assert not flags ? 'number', 'progress never returns the number';
  perform pg_temp.reset();

  -- 3. Invalid numbers are refused.
  perform pg_temp.act_as(a4::text);
  begin
    perform public.set_my_tax_id('529.982.247-24');
    raise exception 'accepted a CPF with a wrong check digit';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.set_my_tax_id('123');
    raise exception 'accepted a number that is neither CPF nor CNPJ';
  exception when invalid_parameter_value then null; end;
  -- 4. One instructor account per CPF ...
  begin
    perform public.set_my_tax_id('39053344705');
    raise exception 'two instructors share one CPF';
  exception when unique_violation then null; end;
  -- ... but the same person may also hold an affiliate account (c1 has this CNPJ).
  perform public.set_my_tax_id('11.222.333/0001-81');
  assert (select kind from public.account_tax_ids where id = a4) = 'cnpj', 'instructor may use a CNPJ';
  perform pg_temp.reset();

  -- 5. Students and admins have no tax id here; only the holder or the admin reads it.
  perform pg_temp.act_as(student_id::text);
  begin
    perform public.set_my_tax_id('52998224725');
    raise exception 'student registered a tax id';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.account_tax_ids) = 0, 'student reads no tax id';
  perform pg_temp.reset();

  perform pg_temp.act_as(a3::text);
  assert (select count(*) from public.account_tax_ids) = 1, 'instructor reads only their own';
  begin
    update public.account_tax_ids set number = '52998224725' where id = a3;
    raise exception 'client updated the table directly';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.account_tax_ids (id, account_role, kind, number)
      values (a3, 'instructor', 'cpf', '52998224725');
    raise exception 'client inserted directly';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_set_tax_id(a1, '52998224725', 'tentativa');
    raise exception 'instructor used the admin correction';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  execute 'set role anon';
  begin
    perform count(*) from public.account_tax_ids;
    raise exception 'anon read tax ids';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  perform pg_temp.act_as(admin_id::text);
  assert (select count(*) from public.account_tax_ids) >= 5, 'admin reads every tax id for verification';
  perform pg_temp.reset();

  -- 6. First approval of an instructor requires the tax id.
  insert into public.instructor_documents (instructor_id, kind, storage_path, original_name, status)
  select a5, k.kind, a5::text || '/' || gen_random_uuid()::text || '.pdf', k.kind || '.pdf', 'approved'
  from (values ('identity'), ('certification')) as k(kind);
  perform pg_temp.act_as(admin_id::text);
  begin
    perform public.set_instructor_status(a5, 'approved', 'Documentos ok');
    raise exception 'instructor approved without CPF or CNPJ';
  exception when sqlstate '55000' then
    assert sqlerrm like '%CPF or CNPJ is required%', 'clear reason: ' || sqlerrm;
  end;
  perform pg_temp.reset();
  assert (select approved_at from public.instructors where id = a5) is null, 'still in review';

  perform pg_temp.act_as(a5::text);
  perform public.set_my_tax_id('123.456.789-09');
  perform pg_temp.reset();
  perform pg_temp.act_as(admin_id::text);
  perform public.set_instructor_status(a5, 'approved', 'Documentos e CPF conferidos');
  perform pg_temp.reset();
  assert (select status from public.instructors where id = a5) = 'approved', 'approved with CPF';

  -- 7. After approval the holder cannot change it; the admin corrects it, audited.
  perform pg_temp.act_as(a5::text);
  begin
    perform public.set_my_tax_id('98765432100');
    raise exception 'approved instructor swapped the checked CPF';
  exception when sqlstate '55000' then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(admin_id::text);
  begin
    perform public.admin_set_tax_id(a5, '12ABC34501DE35', ' ');
    raise exception 'correction without a reason';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.admin_set_tax_id(student_id, '12ABC34501DE35', 'Aluno não tem CPF aqui');
    raise exception 'tax id set on a student account';
  exception when no_data_found then null; end;
  perform public.admin_set_tax_id(a5, '12.abc.345/01de-35', 'CNPJ informado pelo instrutor por e-mail');
  perform pg_temp.reset();
  assert (select number from public.account_tax_ids where id = a5) = '12ABC34501DE35', 'admin correction saved';
  assert exists (select 1 from public.audit_logs where action = 'account.tax_id_corrected'
    and entity_id = a5::text and actor_id = admin_id), 'correction audited';

  -- 8. Accounts approved before migration 47 may add the document once.
  update public.instructors set status = 'approved', approved_at = now() where id = a6;
  perform pg_temp.act_as(a6::text);
  assert not (public.get_instructor_profile_progress(a6) ->> 'taxId')::boolean, 'missing document is flagged';
  perform public.set_my_tax_id('246.813.579-28');
  begin
    perform public.set_my_tax_id('98765432100');
    raise exception 'approved instructor changed the document twice';
  exception when sqlstate '55000' then null; end;
  perform pg_temp.reset();

  -- 9. Affiliate approval requires the tax id too.
  perform pg_temp.act_as(c2::text);
  perform public.register_partner('Loja do Kite', (select id from public.beaches where slug = 'prea'));
  perform public.update_my_partner_profile('Loja do Kite', (select id from public.beaches where slug = 'prea'),
    'Joana Prado', '(88) 98888-7777', 'Jijoca de Jericoacoara', 'Rua do Vento, 20', '');
  perform pg_temp.reset();
  select id into c2_partner from public.partners where owner_id = c2;
  perform pg_temp.act_as(admin_id::text);
  assert not (public.get_partner_profile_progress(c2_partner) ->> 'taxId')::boolean, 'affiliate document missing';
  begin
    perform public.set_partner_status(c2_partner, 'approved', 'Contato conferido');
    raise exception 'affiliate approved without CPF or CNPJ';
  exception when sqlstate '55000' then
    assert sqlerrm like '%CPF or CNPJ is required%', 'clear reason: ' || sqlerrm;
  end;
  perform pg_temp.reset();
  perform pg_temp.act_as(c2::text);
  perform public.set_my_tax_id('11.444.777/0001-61');
  assert (public.get_partner_profile_progress(c2_partner) ->> 'taxId')::boolean, 'affiliate document filled';
  perform pg_temp.reset();
  perform pg_temp.act_as(admin_id::text);
  perform public.set_partner_status(c2_partner, 'approved', 'Contato e CNPJ conferidos');
  perform pg_temp.reset();
  perform pg_temp.act_as(c2::text);
  begin
    perform public.set_my_tax_id('39053344705');
    raise exception 'approved affiliate swapped the checked CNPJ';
  exception when sqlstate '55000' then null; end;
  perform pg_temp.reset();

  -- 10. Two affiliate accounts cannot share a document (c1 already has this CNPJ).
  update public.partners set status = 'pending' where owner_id = c2;
  perform pg_temp.act_as(c2::text);
  begin
    perform public.set_my_tax_id('11222333000181');
    raise exception 'two affiliates share one CNPJ';
  exception when unique_violation then null; end;
  perform pg_temp.reset();
  update public.partners set status = 'approved' where owner_id = c2;

  -- 11. The audit trail never stores the number itself.
  assert (select count(*) from public.audit_logs where action like 'account.tax_id%') >= 6,
    'saves and corrections are audited';
  assert not exists (
    select 1 from public.audit_logs
    where action like 'account.tax_id%'
      and (coalesce(previous_state::text, '') || coalesce(new_state::text, '') || coalesce(reason, ''))
        ~ '[0-9]{11}|[0-9A-Z]{12}[0-9]{2}'
  ), 'audit log holds no CPF or CNPJ';
  assert c1 is not null;
end $$;

select 'PASS: CPF/CNPJ private, valid, unique per account type, required for approval and locked after it';
