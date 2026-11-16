-- Business fase 1 (migration 20261115120000): empresas, unidades, equipe, convites, instrutores e auditoria.
-- Isolamento entre empresas e unidades, sem Proprietário por convite, auditoria append-only.
\set ON_ERROR_STOP on

create function pg_temp.act_as(uid text, aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.aal', aal, false);
  execute 'set role authenticated';
end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.aal', 'aal2', false);
end $$;

-- Fixtures (como superusuário). Uma conta administradora nunca nasce do cadastro: promovida à mão.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000e0001', 'own1@test.example', '{"full_name":"Dona A","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000e0002', 'own2@test.example', '{"full_name":"Dono B","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000e0003', 'mgr@test.example', '{"full_name":"Gerente","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000e0004', 'att@test.example', '{"full_name":"Atendente","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000e0005', 'ins@test.example', '{"full_name":"Instrutor","role":"instructor"}', now()),
  ('00000000-0000-0000-0000-0000000e0006', 'ins2@test.example', '{"full_name":"Instrutor Pendente","role":"instructor"}', now()),
  ('00000000-0000-0000-0000-0000000e0007', 'adm@test.example', '{"full_name":"Admin","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000e0008', null, '{"full_name":"Conta só com telefone","role":"student"}', null);
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000e0007';
update public.instructors set status = 'approved', approved_at = now() where id = '00000000-0000-0000-0000-0000000e0005';

do $$
declare
  own1 text := '00000000-0000-0000-0000-0000000e0001'; own2 text := '00000000-0000-0000-0000-0000000e0002';
  mgr text := '00000000-0000-0000-0000-0000000e0003'; att text := '00000000-0000-0000-0000-0000000e0004';
  ins text := '00000000-0000-0000-0000-0000000e0005'; ins2 text := '00000000-0000-0000-0000-0000000e0006'; adm text := '00000000-0000-0000-0000-0000000e0007';
  a uuid; b uuid; u1 uuid; u2 uuid; ub uuid; inv_m uuid; inv_a uuid; inv_i uuid; mem_m uuid; mem_a uuid; link uuid; n int; inv_bad uuid;
begin
  -- 1. Cadastro: CNPJ válido (numérico e alfanumérico), nunca administrador, empresa nasce pendente.
  perform pg_temp.act_as(own1);
  a := public.create_company('Escola A Ltda', 'Escola A', '11.222.333/0001-81');
  assert (select status from public.companies where id = a) = 'pending', 'born pending';
  begin perform public.create_company('Outra Ltda', 'Outra', '11222333000182'); raise exception 'bad CNPJ accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.create_company('Duplicada Ltda', 'Duplicada', '11222333000181'); raise exception 'duplicate CNPJ accepted';
  exception when unique_violation then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(own2); b := public.create_company('Escola B Ltda', 'Escola B', '12ABC34501DE35'); perform pg_temp.reset();
  perform pg_temp.act_as(adm);
  begin perform public.create_company('Admin Ltda', 'Admin', '11444777000161'); raise exception 'admin created a company';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  begin perform public.create_company('Anon Ltda', 'Anon', '11444777000161'); raise exception 'unauthenticated created a company';
  exception when others then assert sqlstate = '28000', 'sign-in required'; end;

  -- 2. Pendente: nada opera. Só o administrador (com segundo fator) aprova, com motivo, e fica auditado.
  perform pg_temp.act_as(own1);
  begin perform public.create_unit(a, 'Preá Beach', 'Cruz', 'Av. da Praia, 120', -2.8, -40.4, '07:00', '17:00'); raise exception 'pending company created a unit';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_set_company_status(a, 'active', 'me aprovando'); raise exception 'owner approved own company';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(adm, 'aal1');
  begin perform public.admin_set_company_status(a, 'active', 'Documentos conferidos'); raise exception 'admin without second factor approved';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(adm);
  begin perform public.admin_set_company_status(a, 'active', ' '); raise exception 'approval without reason';
  exception when invalid_parameter_value then null; end;
  perform public.admin_set_company_status(a, 'active', 'Documentos conferidos'); perform public.admin_set_company_status(b, 'active', 'Documentos conferidos');
  perform pg_temp.reset();
  assert exists (select 1 from public.audit_logs where action = 'company.status' and entity_id = a::text), 'platform audit';
  assert exists (select 1 from public.company_audit_logs where company_id = a and action = 'company.status'), 'company audit';

  -- 3. Unidades: só o dono cria; horários coerentes.
  perform pg_temp.act_as(own1);
  u1 := public.create_unit(a, 'Preá Beach', 'Cruz', 'Av. da Praia, 120', -2.8, -40.4, '07:00', '17:00');
  u2 := public.create_unit(a, 'Jeri Centro', 'Jijoca de Jericoacoara', 'Rua Principal, 45', null, null, '08:00', '18:00');
  begin perform public.create_unit(a, 'Horário Ruim', 'Cruz', 'Rua sem horário, 1', null, null, '18:00', '08:00'); raise exception 'bad hours';
  exception when check_violation then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(own2); ub := public.create_unit(b, 'Unidade B', 'Camocim', 'Orla da Barra, 8', null, null, '08:00', '16:00');
  begin perform public.create_unit(a, 'Invasão', 'Cruz', 'Rua do invasor, 9', null, null, '08:00', '16:00'); raise exception 'other company created a unit';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  -- 4. Convite de funcionário: nunca Proprietário, unidade só da própria empresa, sem duplicata pendente.
  perform pg_temp.act_as(own1);
  begin perform public.invite_staff(a, 'x@test.example', jsonb_build_array(jsonb_build_object('unit_id', u1, 'role', 'owner'))); raise exception 'owner by invitation';
  exception when invalid_parameter_value then null; end;
  begin perform public.invite_staff(a, 'x@test.example', jsonb_build_array(jsonb_build_object('unit_id', ub, 'role', 'manager'))); raise exception 'unit of another company';
  exception when invalid_parameter_value then null; end;
  begin perform public.invite_staff(a, 'x@test.example', '[]'::jsonb); raise exception 'no grants';
  exception when invalid_parameter_value then null; end;
  inv_m := public.invite_staff(a, 'MGR@test.example', jsonb_build_array(jsonb_build_object('unit_id', u1, 'role', 'manager'), jsonb_build_object('unit_id', u2, 'role', 'attendant')));
  begin perform public.invite_staff(a, 'mgr@test.example', jsonb_build_array(jsonb_build_object('unit_id', u1, 'role', 'manager'))); raise exception 'duplicate pending';
  exception when unique_violation then null; end;
  inv_a := public.invite_staff(a, 'att@test.example', jsonb_build_array(jsonb_build_object('unit_id', u2, 'role', 'attendant')));
  perform pg_temp.reset();

  -- 5. Só o convidado responde com o próprio e-mail confirmado; o administrador não entra na empresa.
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000e0008');
  begin perform public.accept_company_invitation(inv_m); raise exception 'a session without email accepted';
  exception when insufficient_privilege then null; end;
  begin perform public.decline_company_invitation(inv_m); raise exception 'a session without email declined';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  update auth.users set email_confirmed_at = null where id = mgr::uuid;
  perform pg_temp.act_as(mgr);
  assert (select count(*) from public.company_invitations where id = inv_m) = 0, 'an unconfirmed email cannot see the invitation';
  begin perform public.accept_company_invitation(inv_m); raise exception 'an unconfirmed account accepted';
  exception when insufficient_privilege then null; end;
  begin perform public.decline_company_invitation(inv_m); raise exception 'an unconfirmed account declined';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  assert (select status from public.company_invitations where id = inv_m) = 'pending', 'the rejected responses leave the invitation pending';
  assert not exists (select 1 from public.company_members where company_id = a and user_id = mgr::uuid), 'no membership is created';
  update auth.users set email_confirmed_at = now() where id = mgr::uuid;

  perform pg_temp.act_as(att);
  begin perform public.accept_company_invitation(inv_m); raise exception 'someone else accepted';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.company_invitations where id = inv_m) = 0, 'cannot even see another invitee''s invitation';
  perform public.accept_company_invitation(inv_a); perform pg_temp.reset();
  perform pg_temp.act_as(mgr); perform public.accept_company_invitation(inv_m); perform pg_temp.reset();
  begin perform public.accept_company_invitation(inv_m); raise exception 'accepted twice'; exception when insufficient_privilege or others then null; end;
  perform pg_temp.act_as(own1); inv_bad := public.invite_staff(a, 'adm@test.example', jsonb_build_array(jsonb_build_object('unit_id', u1, 'role', 'manager'))); perform pg_temp.reset();
  perform pg_temp.act_as(adm);
  begin perform public.accept_company_invitation(inv_bad); raise exception 'a platform admin joined a company';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  select id into mem_m from public.company_members where user_id = mgr::uuid; select id into mem_a from public.company_members where user_id = att::uuid;

  -- 6. Permissão por unidade: o mesmo gerente é atendente na outra unidade.
  perform pg_temp.act_as(mgr);
  assert public.company_has_permission(u1, 'units.edit'), 'manager edits U1'; assert not public.company_has_permission(u2, 'units.edit'), 'attendant cannot edit U2';
  assert public.company_has_permission(u2, 'agenda.edit'), 'but schedules in U2'; assert not public.company_has_permission(u1, 'perm.edit') and not public.company_has_permission(u2, 'perm.edit'), 'no perm.edit';
  perform public.update_unit(u1, 'Preá Beach', 'Cruz', 'Av. da Praia, 120', '07:00', '17:30', true);
  begin perform public.update_unit(u2, 'Jeri Centro', 'Jijoca de Jericoacoara', 'Rua Principal, 45', '08:00', '18:00', true); raise exception 'attendant edited a unit';
  exception when insufficient_privilege then null; end;
  begin perform public.update_unit(u1, 'Preá Beach', 'Cruz', 'Av. da Praia, 120', '07:00', '17:30', false); raise exception 'manager deactivated a unit';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  -- 7. Isolamento: cada pessoa vê só o que está ligada; a outra empresa não vê nada.
  perform pg_temp.act_as(att);
  assert (select count(*) from public.company_units) = 1 and (select id from public.company_units) = u2, 'attendant sees only the unit they work in';
  perform pg_temp.reset();
  perform pg_temp.act_as(mgr); assert (select count(*) from public.company_units) = 2, 'manager sees both'; assert (select count(*) from public.company_members) >= 1; perform pg_temp.reset();
  perform pg_temp.act_as(own2);
  assert (select count(*) from public.company_units where company_id = a) = 0, 'B sees no unit of A'; assert (select count(*) from public.companies where id = a) = 0, 'B sees no company A';
  assert (select count(*) from public.company_members where company_id = a) = 0 and (select count(*) from public.company_invitations where company_id = a) = 0 and (select count(*) from public.company_audit_logs where company_id = a) = 0, 'B sees no staff, invitation or audit of A';
  assert not public.company_has_permission(u1, 'units.view'), 'B has no permission in A';
  begin perform public.set_member_unit_role(mem_m, u1, 'attendant'); raise exception 'B changed a role in A'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  -- 8. Exceções por pessoa e unidade; permissão sensível só o Proprietário concede.
  perform pg_temp.act_as(mgr);
  begin perform public.set_member_override(mem_a, u2, 'cash.close', true); raise exception 'manager without perm.edit set an override'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(own1);
  perform public.set_member_override(mem_a, u2, 'cash.close', true); perform public.set_member_override(mem_a, u2, 'agenda.edit', false);
  perform public.set_member_override(mem_m, u1, 'perm.edit', true); perform pg_temp.reset();
  perform pg_temp.act_as(att); assert public.company_has_permission(u2, 'cash.close') and not public.company_has_permission(u2, 'agenda.edit'), 'overrides apply'; perform pg_temp.reset();
  perform pg_temp.act_as(mgr);
  assert public.company_has_permission(u1, 'perm.edit') and not public.company_has_permission(u2, 'perm.edit'), 'the grant is per unit';
  begin perform public.set_member_override(mem_m, u1, 'cash.close', true); raise exception 'non-owner granted a sensitive permission'; exception when insufficient_privilege then null; end;
  perform public.set_member_override(mem_m, u1, 'agenda.view', true);
  begin perform public.set_member_override(mem_a, u2, 'agenda.view', false); raise exception 'perm.edit in U1 reached U2'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(own1); perform public.set_member_override(mem_a, u2, 'agenda.edit', null); perform pg_temp.reset();
  perform pg_temp.act_as(att); assert public.company_has_permission(u2, 'agenda.edit'), 'removing the exception restores the role'; perform pg_temp.reset();
  perform pg_temp.act_as(own1); perform public.set_member_override(mem_a, u2, 'cash.close', null); perform pg_temp.reset();

  -- 9. Troca e remoção de cargo; nunca para Proprietário.
  perform pg_temp.act_as(own1);
  begin perform public.set_member_unit_role(mem_a, u2, 'owner'); raise exception 'made owner'; exception when invalid_parameter_value then null; end;
  perform public.set_member_unit_role(mem_a, u2, 'finance');
  perform pg_temp.reset();
  perform pg_temp.act_as(att); assert public.company_has_permission(u2, 'cash.close'), 'role changed to finance'; perform pg_temp.reset();
  perform pg_temp.act_as(own1); perform public.set_member_unit_role(mem_a, u2, null); perform pg_temp.reset();
  perform pg_temp.act_as(att); assert (select count(*) from public.company_units) = 0 and not public.company_has_permission(u2, 'units.view'), 'unlinked: sees nothing'; perform pg_temp.reset();

  -- 10. Instrutor: convite aceito só por instrutor aprovado; comissão inicial vira a primeira versão.
  perform pg_temp.act_as(mgr);
  inv_i := public.invite_instructor(a, 'ins@test.example', array[u1], 5500);
  begin perform public.invite_instructor(a, 'ins@test.example', array[u1], 5500); raise exception 'duplicate pending instructor invite'; exception when unique_violation then null; end;
  begin perform public.invite_instructor(a, 'x@test.example', array[u1], 9500); raise exception 'commission out of range'; exception when check_violation then null; end;
  begin perform public.invite_instructor(a, 'x@test.example', array[ub], 5500); raise exception 'unit of another company'; exception when invalid_parameter_value then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(ins2); begin perform public.accept_company_invitation(inv_i); raise exception 'wrong account accepted'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(ins); perform public.accept_company_invitation(inv_i);
  assert (select count(*) from public.company_instructor_links) = 1, 'the instructor sees only their own link'; perform pg_temp.reset();
  select id into link from public.company_instructor_links where instructor_id = ins::uuid;
  assert (select bps from public.company_instructor_rates where link_id = link) = 5500, 'first rate version';

  -- 11. Suspender o vínculo na escola não bane o instrutor.
  perform pg_temp.act_as(mgr);
  begin perform public.set_instructor_link_status(link, 'suspended', 'x'); raise exception 'no reason'; exception when invalid_parameter_value then null; end;
  perform public.set_instructor_link_status(link, 'suspended', 'Faltas repetidas em aulas');
  perform pg_temp.reset();
  assert (select status from public.company_instructor_links where id = link) = 'suspended', 'link suspended';
  assert (select status from public.instructors where id = ins::uuid) = 'approved', 'global instructor status untouched';
  perform pg_temp.act_as(own2); begin perform public.set_instructor_link_status(link, 'active', 'Tentando reativar'); raise exception 'another company changed the link'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(mgr); perform public.set_instructor_link_status(link, 'active', 'Acordo reestabelecido'); perform pg_temp.reset();

  -- 12. Comissão individual: nova versão a partir de hoje, nunca reescreve.
  perform pg_temp.act_as(mgr);
  perform public.set_instructor_rate(link, u1, 6000);
  begin perform public.set_instructor_rate(link, u1, 6500); raise exception 'second change the same day'; exception when unique_violation then null; end;
  begin perform public.set_instructor_rate(link, u1, 9500); raise exception 'out of range'; exception when invalid_parameter_value then null; end;
  begin perform public.set_instructor_rate(link, u2, 6000); raise exception 'unit not in the link'; exception when invalid_parameter_value then null; end;
  perform pg_temp.reset();
  assert (select count(*) from public.company_instructor_rates where link_id = link) = 2 and (select bps from public.company_instructor_rates where link_id = link and unit_id is null) = 5500, 'the first version is intact';
  begin update public.company_instructor_rates set bps = 9000 where link_id = link; raise exception 'rate updated'; exception when insufficient_privilege then null; end;
  begin delete from public.company_instructor_rates where link_id = link; raise exception 'rate deleted'; exception when insufficient_privilege then null; end;
  perform pg_temp.act_as(own2); begin perform public.set_instructor_rate(link, null, 7000); raise exception 'another company set a rate'; exception when insufficient_privilege then null; end;
  assert (select count(*) from public.company_instructor_links) = 0 and (select count(*) from public.company_instructor_rates) = 0, 'B sees no instructor link or rate of A'; perform pg_temp.reset();

  -- 13. O cliente nunca escreve direto.
  perform pg_temp.act_as(own1);
  begin insert into public.companies (owner_id, legal_name, trade_name, cnpj) values (own1::uuid, 'Direta Ltda', 'Direta', '11444777000161'); raise exception 'direct insert'; exception when insufficient_privilege then null; end;
  begin update public.companies set status = 'active' where id = a; raise exception 'direct update'; exception when insufficient_privilege then null; end;
  begin delete from public.company_units where id = u1; raise exception 'direct delete'; exception when insufficient_privilege then null; end;
  begin insert into public.company_audit_logs (company_id, actor_id, action) values (a, own1::uuid, 'forjado'); raise exception 'forged audit'; exception when insufficient_privilege then null; end;
  begin perform public.company_audit(a, null, 'forjado', ''); raise exception 'internal function callable'; exception when insufficient_privilege then null; end;
  begin perform public.require_company_permission(u1, 'units.view'); raise exception 'internal guard callable'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  execute 'set role anon';
  begin perform count(*) from public.companies; raise exception 'anon read companies'; exception when insufficient_privilege then null; end;
  begin perform public.create_company('Anon Ltda', 'Anon', '11444777000161'); raise exception 'anon created a company'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  -- 14. Auditoria: quem tem perm.edit lê; quem não tem não; ninguém edita nem apaga.
  perform pg_temp.act_as(own1); select count(*) into n from public.company_audit_logs where company_id = a; assert n >= 10, 'owner reads the audit'; perform pg_temp.reset();
  perform pg_temp.act_as(att); assert (select count(*) from public.company_audit_logs) = 0, 'attendant reads no audit'; perform pg_temp.reset();
  perform pg_temp.act_as(own1);
  begin update public.company_audit_logs set action = 'x'; raise exception 'audit edited'; exception when insufficient_privilege then null; end;
  begin delete from public.company_audit_logs; raise exception 'audit deleted'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  begin delete from public.company_audit_logs; raise exception 'audit deleted even by superuser'; exception when insufficient_privilege then null; end;
  assert not exists (select 1 from public.company_audit_logs where detail::text ~ '[0-9]{14}'), 'the audit never stores a CNPJ';

  -- 15. Administração: lê para suporte só com segundo fator.
  perform pg_temp.act_as(adm); assert (select count(*) from public.companies) = 2, 'admin reads companies'; perform pg_temp.reset();
  perform pg_temp.act_as(adm, 'aal1'); assert (select count(*) from public.companies) = 0, 'admin without second factor reads nothing'; perform pg_temp.reset();
end $$;

-- Catálogo: toda tabela nova tem RLS e nenhuma dá escrita ao cliente.
do $$ declare t text; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and (c.relname like 'company\_%' or c.relname = 'companies') loop
    assert (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), t || ' has RLS';
    assert not has_table_privilege('authenticated', 'public.' || t, 'INSERT') and not has_table_privilege('authenticated', 'public.' || t, 'UPDATE') and not has_table_privilege('authenticated', 'public.' || t, 'DELETE'), t || ' is read-only for clients';
    assert not has_table_privilege('anon', 'public.' || t, 'SELECT'), t || ' is closed to anon';
  end loop;
end $$;
do $$ declare f text; begin
  for f in select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and (p.proname like 'company\_%' or p.proname in ('create_company','admin_set_company_status','create_unit','update_unit','invite_staff','invite_instructor','accept_company_invitation','decline_company_invitation','set_member_unit_role','set_member_override','set_instructor_link_status','set_instructor_rate','require_company_permission','auth_email')) loop
    assert exists (select 1 from pg_proc p2 where p2.proname = f and exists (select 1 from unnest(coalesce(p2.proconfig, '{}')) c where c like 'search_path=%')), f || ' has a fixed search_path';
  end loop;
end $$;

select 'PASS: business company core (isolation by company and unit, no owner by invitation, append-only audit, instructor link and rate rules)';
