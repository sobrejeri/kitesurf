-- Business fase 2: serviços, preços por unidade, pacotes e reservas presenciais com agenda única.
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
-- Fortaleza local day offset + hh:mm -> timestamptz
create function pg_temp.at(off integer, hhmm text) returns timestamptz language sql as $$
  select (((now() at time zone 'America/Fortaleza')::date + off + hhmm::time) at time zone 'America/Fortaleza');
$$;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000f0001', 'o1@svc.example', '{"full_name":"Dona A","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000f0002', 'o2@svc.example', '{"full_name":"Dono B","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000f0003', 'mg@svc.example', '{"full_name":"Gerente","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000f0004', 'fi@svc.example', '{"full_name":"Financeiro","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000f0005', 'at@svc.example', '{"full_name":"Atendente","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000f0006', 'ins@svc.example', '{"full_name":"Instrutor","role":"instructor"}', now()),
  ('00000000-0000-0000-0000-0000000f0007', 'insb@svc.example', '{"full_name":"Instrutor Sem Vinculo","role":"instructor"}', now()),
  ('00000000-0000-0000-0000-0000000f0008', 'adm@svc.example', '{"full_name":"Admin","role":"student"}', now());
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000f0008';
update public.instructors set status = 'approved', approved_at = now() where id in ('00000000-0000-0000-0000-0000000f0006', '00000000-0000-0000-0000-0000000f0007');

do $$
declare
  o1 text := '00000000-0000-0000-0000-0000000f0001'; o2 text := '00000000-0000-0000-0000-0000000f0002'; mg text := '00000000-0000-0000-0000-0000000f0003';
  fi text := '00000000-0000-0000-0000-0000000f0004'; at_ text := '00000000-0000-0000-0000-0000000f0005'; ins text := '00000000-0000-0000-0000-0000000f0006';
  insb text := '00000000-0000-0000-0000-0000000f0007'; adm text := '00000000-0000-0000-0000-0000000f0008';
  a uuid; b uuid; u1 uuid; u2 uuid; ub uuid; inv uuid; inv_b uuid; link_a uuid; link_b uuid; s1 uuid; s2 uuid; sb uuid; b1 uuid; b2 uuid; b3 uuid; b4 uuid; bb uuid; pk uuid;
  msg text; msg2 text; n int; r record; dow4 int := extract(dow from (now() at time zone 'America/Fortaleza')::date + 4)::int; k jsonb;
begin
  -- Preparação: duas empresas ativas, unidades, equipe, e o MESMO instrutor vinculado às duas.
  perform pg_temp.act_as(o1); a := public.create_company('Escola Servicos A Ltda', 'Escola SA', '11222333000262'); perform pg_temp.reset();
  perform pg_temp.act_as(o2); b := public.create_company('Escola Servicos B Ltda', 'Escola SB', '99887766000105'); perform pg_temp.reset();
  perform pg_temp.act_as(adm); perform public.admin_set_company_status(a, 'active', 'Documentos conferidos'); perform public.admin_set_company_status(b, 'active', 'Documentos conferidos'); perform pg_temp.reset();
  perform pg_temp.act_as(o1);
  u1 := public.create_unit(a, 'Preá Beach', 'Cruz', 'Av. da Praia, 120', null, null, '06:00', '20:00');
  u2 := public.create_unit(a, 'Jeri Centro', 'Jijoca de Jericoacoara', 'Rua Principal, 45', null, null, '06:00', '20:00');
  inv := public.invite_staff(a, 'mg@svc.example', jsonb_build_array(jsonb_build_object('unit_id', u1, 'role', 'manager'), jsonb_build_object('unit_id', u2, 'role', 'manager')));
  perform public.invite_staff(a, 'fi@svc.example', jsonb_build_array(jsonb_build_object('unit_id', u1, 'role', 'finance')));
  perform public.invite_staff(a, 'at@svc.example', jsonb_build_array(jsonb_build_object('unit_id', u1, 'role', 'attendant')));
  inv_b := public.invite_instructor(a, 'ins@svc.example', array[u1, u2], 5500);
  perform pg_temp.reset();
  perform pg_temp.act_as(mg); perform public.accept_company_invitation(inv); perform pg_temp.reset();
  perform pg_temp.act_as(fi); perform public.accept_company_invitation((select id from public.company_invitations where email = 'fi@svc.example')); perform pg_temp.reset();
  perform pg_temp.act_as(at_); perform public.accept_company_invitation((select id from public.company_invitations where email = 'at@svc.example')); perform pg_temp.reset();
  perform pg_temp.act_as(o2); ub := public.create_unit(b, 'Unidade B', 'Camocim', 'Orla da Barra, 8', null, null, '06:00', '20:00'); inv := public.invite_instructor(b, 'ins@svc.example', array[ub], 6500); perform pg_temp.reset();
  perform pg_temp.act_as(ins); perform public.accept_company_invitation(inv_b); perform public.accept_company_invitation(inv);
  perform public.save_my_schedule(array[0,1,2,3,4,5,6], '07:00', '18:00', 0); perform pg_temp.reset();
  select id into link_a from public.company_instructor_links where company_id = a and instructor_id = ins::uuid;
  select id into link_b from public.company_instructor_links where company_id = b and instructor_id = ins::uuid;

  -- 1. Serviços: só quem edita; duração em múltiplos de 15; preço base mínimo; nome único por empresa.
  perform pg_temp.act_as(o1);
  s1 := public.create_service(a, 'Aula iniciante', 120, 2, 'Primeiro contato', 26000);
  begin perform public.create_service(a, 'Aula torta', 50, 2, '', 26000); raise exception 'minutes not multiple of 15'; exception when check_violation then null; end;
  begin perform public.create_service(a, 'Aula barata', 60, 2, '', 500); raise exception 'price below minimum'; exception when check_violation then null; end;
  begin perform public.create_service(a, 'Aula iniciante', 60, 2, '', 26000); raise exception 'duplicate name'; exception when unique_violation then null; end;
  s2 := public.create_service(a, 'Aula curta', 60, 1, '', 15000);
  perform pg_temp.reset();
  perform pg_temp.act_as(at_); begin perform public.create_service(a, 'Servico do atendente', 60, 1, '', 15000); raise exception 'attendant created a service'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(o2); begin perform public.create_service(a, 'Invasao', 60, 1, '', 15000); raise exception 'other company created a service'; exception when insufficient_privilege then null; end;
  sb := public.create_service(b, 'Aula B', 60, 1, 'Escola B', 20000); perform pg_temp.reset();

  -- 2. Preço por unidade: versão nova, nunca edição; unidade vence a base.
  perform pg_temp.act_as(mg); perform public.set_service_price(s1, u2, 28000);
  begin perform public.set_service_price(s1, u2, 29000); raise exception 'second price change the same day'; exception when unique_violation then null; end;
  begin perform public.set_service_price(s1, ub, 29000); raise exception 'unit of another company'; exception when invalid_parameter_value then null; end;
  perform pg_temp.reset();
  assert public.company_service_price_cents(s1, u1, current_date) = 26000 and public.company_service_price_cents(s1, u2, current_date) = 28000, 'unit price wins, base otherwise';
  begin update public.company_service_prices set cents = 1 where service_id = s1; raise exception 'price edited'; exception when insufficient_privilege then null; end;
  begin delete from public.company_service_prices where service_id = s1; raise exception 'price deleted'; exception when insufficient_privilege then null; end;
  perform pg_temp.act_as(at_); begin perform public.set_service_price(s1, u1, 27000); raise exception 'attendant set a price'; exception when insufficient_privilege then null; end; perform pg_temp.reset();

  -- 3. Serviço por unidade: só instrutor com vínculo ativo na unidade.
  perform pg_temp.act_as(mg);
  begin perform public.set_unit_service(s1, u1, 'x', array[1]::smallint[], array[link_b], true); raise exception 'link of another company'; exception when invalid_parameter_value then null; end;
  begin perform public.set_unit_service(s1, u1, 'x', array[9]::smallint[], array[link_a], true); raise exception 'bad weekday'; exception when check_violation then null; end;
  perform public.set_unit_service(s1, u1, 'Praia do Preá, ponto 2', array[0,1,2,3,4,5,6]::smallint[], array[link_a], true);
  perform public.set_unit_service(s1, u2, 'Jeri, frente do Pôr do Sol', array[0,1,2,3,4,5,6]::smallint[], array[link_a], true);
  perform public.set_unit_service(s2, u1, 'Preá', array_remove(array[0,1,2,3,4,5,6], dow4)::smallint[], array[link_a], true);
  perform pg_temp.reset();
  perform pg_temp.act_as(o2); perform public.set_unit_service(sb, ub, 'Barra', array[0,1,2,3,4,5,6]::smallint[], array[link_b], true); perform pg_temp.reset();

  -- 4. Reserva presencial: o cliente envia escolhas; valores saem do banco e ficam congelados.
  perform pg_temp.act_as(at_);
  b1 := public.create_external_booking(u1, s1, ins::uuid, 'Cliente Um', '(88) 99999-0001', pg_temp.at(3, '10:00'));
  perform pg_temp.reset();
  select * into r from public.company_external_bookings where id = b1;
  assert r.price_cents = 26000 and r.commission_bps = 5500 and r.commission_cents = 14300 and r.school_cents = 11700, 'frozen split from the price and rate in force';
  assert r.commission_cents + r.school_cents = r.price_cents and r.minutes = 120 and r.customer_phone = '88999990001' and r.code like 'PRE-%' and r.status = 'confirmed', 'sum, minutes, phone digits, code';
  perform pg_temp.act_as(mg); b2 := public.create_external_booking(u2, s1, ins::uuid, 'Cliente Dois', '88999990002', pg_temp.at(3, '14:00')); perform pg_temp.reset();
  select * into r from public.company_external_bookings where id = b2; assert r.price_cents = 28000 and r.commission_cents = 15400 and r.school_cents = 12600, 'the unit price is the one charged';
  assert exists (select 1 from public.company_audit_logs where company_id = a and action = 'booking.created' and target = b1::text), 'audited';

  -- 5. Agenda única: sobreposição em outra unidade, em outra empresa e no fluxo digital; encostar é permitido.
  perform pg_temp.act_as(mg);
  begin perform public.create_external_booking(u2, s1, ins::uuid, 'Cliente', '88999990003', pg_temp.at(3, '11:00')); raise exception 'overlap across units';
  exception when exclusion_violation then msg := sqlerrm; end;
  b3 := public.create_external_booking(u1, s1, ins::uuid, 'Cliente Tres', '88999990003', pg_temp.at(3, '12:00'));
  perform pg_temp.reset();
  perform pg_temp.act_as(o2);
  begin perform public.create_external_booking(ub, sb, ins::uuid, 'Cliente B', '88999990009', pg_temp.at(3, '10:30')); raise exception 'another company booked the same instructor';
  exception when exclusion_violation then msg2 := sqlerrm; end;
  perform pg_temp.reset();
  assert msg = msg2, 'the refusal is identical: it does not reveal whose time it is';
  assert msg = 'Instructor not available at this time', 'the refusal carries no detail about the other booking';
  assert not public.instructor_can_attend(ins::uuid, jsonb_build_array(jsonb_build_object('starts_at', pg_temp.at(3, '10:30'), 'hours', 1))), 'the digital flow now sees in-person bookings';
  assert public.instructor_can_attend(ins::uuid, jsonb_build_array(jsonb_build_object('starts_at', pg_temp.at(5, '10:00'), 'hours', 1))), 'a free time is still free for the digital flow';
  assert not public.instructor_can_attend(ins::uuid, jsonb_build_array(jsonb_build_object('starts_at', pg_temp.at(5, '19:00'), 'hours', 1))), 'the existing weekly-hours rule is unchanged';

  -- 6. Quem pode e o que é válido.
  perform pg_temp.act_as(fi); begin perform public.create_external_booking(u1, s1, ins::uuid, 'Cliente', '88999990004', pg_temp.at(4, '10:00')); raise exception 'finance booked'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(o2); begin perform public.create_external_booking(u1, s1, ins::uuid, 'Cliente', '88999990004', pg_temp.at(4, '10:00')); raise exception 'other company booked in A'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(at_);
  begin perform public.create_external_booking(u1, s2, insb::uuid, 'Cliente', '88999990004', pg_temp.at(5, '10:00')); raise exception 'instructor without a link'; exception when invalid_parameter_value then null; end;
  perform pg_temp.reset(); perform pg_temp.act_as(mg);
  begin perform public.create_external_booking(u2, s2, ins::uuid, 'Cliente', '88999990004', pg_temp.at(5, '10:00')); raise exception 'service not enabled in the unit'; exception when invalid_parameter_value then null; end;
  perform pg_temp.reset(); perform pg_temp.act_as(at_);
  begin perform public.create_external_booking(u1, s1, ins::uuid, 'Cliente', '88999990004', now() - interval '1 hour'); raise exception 'past time'; exception when invalid_parameter_value then null; end;
  begin perform public.create_external_booking(u1, s1, ins::uuid, 'Cliente', '88999990004', pg_temp.at(5, '05:00')); raise exception 'before the unit opens'; exception when invalid_parameter_value then null; end;
  begin perform public.create_external_booking(u1, s2, ins::uuid, 'Cliente', '88999990004', pg_temp.at(4, '10:00')); raise exception 'weekday not offered'; exception when invalid_parameter_value then null; end;
  begin perform public.create_external_booking(u1, s1, ins::uuid, 'Cliente', '88999990004', pg_temp.at(5, '17:00')); raise exception 'outside the instructor weekly hours'; exception when exclusion_violation then null; end;
  begin perform public.create_external_booking(u1, s1, ins::uuid, 'C', '88999990004', pg_temp.at(5, '10:00')); raise exception 'short name'; exception when check_violation then null; end;
  begin perform public.create_external_booking(u1, s1, ins::uuid, 'Cliente Valido', '123', pg_temp.at(5, '10:00')); raise exception 'bad phone'; exception when check_violation then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(ins); perform public.block_my_time(pg_temp.at(6, '09:00'), pg_temp.at(6, '13:00'), 'Folga'); perform pg_temp.reset();
  perform pg_temp.act_as(at_); begin perform public.create_external_booking(u1, s1, ins::uuid, 'Cliente', '88999990004', pg_temp.at(6, '10:00')); raise exception 'booked over time off'; exception when exclusion_violation then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(o1); perform public.set_instructor_link_status(link_a, 'suspended', 'Faltas repetidas em aulas'); perform pg_temp.reset();
  perform pg_temp.act_as(at_); begin perform public.create_external_booking(u1, s1, ins::uuid, 'Cliente', '88999990004', pg_temp.at(5, '10:00')); raise exception 'suspended link booked'; exception when invalid_parameter_value then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(o1); perform public.set_instructor_link_status(link_a, 'active', 'Acordo reestabelecido'); perform pg_temp.reset();

  -- 7. Valor congelado: preço ou comissão novos valem só para reservas novas.
  begin update public.company_external_bookings set price_cents = 1000, commission_cents = 550, school_cents = 450 where id = b1; raise exception 'snapshot edited by superuser'; exception when insufficient_privilege then null; end;
  perform pg_temp.act_as(o1); begin update public.company_external_bookings set price_cents = 1000 where id = b1; raise exception 'client updated'; exception when insufficient_privilege then null; end;
  begin delete from public.company_external_bookings where id = b1; raise exception 'client deleted'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  begin delete from public.company_external_bookings where id = b1; raise exception 'superuser deleted'; exception when insufficient_privilege then null; end;
  perform pg_temp.act_as(o1); perform public.set_service_price(s1, u1, 30000); perform public.set_instructor_rate(link_a, u1, 7000);
  b4 := public.create_external_booking(u1, s1, ins::uuid, 'Cliente Quatro', '88999990005', pg_temp.at(7, '10:00')); perform pg_temp.reset();
  select * into r from public.company_external_bookings where id = b1; assert r.price_cents = 26000 and r.commission_bps = 5500, 'the old booking keeps its price and rate';
  select * into r from public.company_external_bookings where id = b4; assert r.price_cents = 30000 and r.commission_bps = 7000 and r.commission_cents = 21000 and r.school_cents = 9000, 'the new booking uses the new versions';

  -- 8. Remarcar, cancelar e concluir.
  perform pg_temp.act_as(at_);
  perform public.reschedule_external_booking(b3, pg_temp.at(3, '12:00')); -- ignores itself
  begin perform public.reschedule_external_booking(b3, pg_temp.at(3, '11:00')); raise exception 'moved into another booking'; exception when exclusion_violation then null; end;
  perform public.reschedule_external_booking(b3, pg_temp.at(3, '16:00'));
  begin perform public.cancel_external_booking(b3, 'x'); raise exception 'cancel without a reason'; exception when invalid_parameter_value then null; end;
  perform public.cancel_external_booking(b3, 'Cliente desistiu');
  begin perform public.cancel_external_booking(b3, 'Cliente desistiu de novo'); raise exception 'cancelled twice'; exception when object_not_in_prerequisite_state then null; end;
  begin perform public.reschedule_external_booking(b3, pg_temp.at(3, '17:00')); raise exception 'rescheduled a cancelled booking'; exception when object_not_in_prerequisite_state then null; end;
  perform public.create_external_booking(u1, s1, ins::uuid, 'Cliente Cinco', '88999990006', pg_temp.at(3, '16:00'));
  begin perform public.complete_external_booking(b1); raise exception 'completed a future booking'; exception when object_not_in_prerequisite_state then null; end;
  perform pg_temp.reset();
  select * into r from public.company_external_bookings where id = b3; assert r.status = 'cancelled' and r.cancel_reason = 'Cliente desistiu' and r.price_cents = 26000, 'cancelled keeps its amounts';
  update public.company_external_bookings set starts_at = now() - interval '1 hour' where id = b1;
  perform pg_temp.act_as(at_);
  begin perform public.complete_external_booking(b1); raise exception 'completed a booking during its scheduled window'; exception when object_not_in_prerequisite_state then null; end;
  perform pg_temp.reset();
  assert (select status from public.company_external_bookings where id = b1) = 'confirmed', 'a booking in progress remains confirmed';
  update public.company_external_bookings set starts_at = now() - interval '2 hours' where id = b1;
  perform pg_temp.act_as(at_); perform public.complete_external_booking(b1); perform pg_temp.reset();
  assert (select status from public.company_external_bookings where id = b1) = 'done', 'completion succeeds at the scheduled end';
  begin update public.company_external_bookings set status = 'confirmed' where id = b1; raise exception 'reopened a done booking'; exception when insufficient_privilege then null; end;

  -- A conclusão não libera o buffer entre aulas no presencial ou no digital.
  update public.company_external_bookings set starts_at = pg_temp.at(-2, '10:00') where id = b2;
  perform pg_temp.act_as(mg); perform public.complete_external_booking(b2); perform pg_temp.reset();
  perform pg_temp.act_as(ins); perform public.save_my_schedule(array[0,1,2,3,4,5,6], '07:00', '18:00', 30); perform pg_temp.reset();
  assert not public.company_instructor_is_free(ins::uuid, pg_temp.at(-2, '12:15'), 60), 'an in-person lesson cannot start inside the buffer after a completed lesson';
  assert not public.instructor_can_attend(ins::uuid, jsonb_build_array(jsonb_build_object('starts_at', pg_temp.at(-2, '12:15'), 'hours', 1))), 'the digital flow also respects that buffer';
  assert public.company_instructor_is_free(ins::uuid, pg_temp.at(-2, '12:30'), 60), 'in-person availability resumes exactly at the end of the buffer';
  assert public.instructor_can_attend(ins::uuid, jsonb_build_array(jsonb_build_object('starts_at', pg_temp.at(-2, '12:30'), 'hours', 1))), 'digital availability resumes exactly at the end of the buffer';

  -- 9. Isolamento entre empresas e privacidade da agenda.
  perform pg_temp.act_as(o2);
  assert (select count(*) from public.company_services where company_id = a) = 0 and (select count(*) from public.company_service_prices where service_id = s1) = 0
    and (select count(*) from public.company_unit_services where service_id = s1) = 0 and (select count(*) from public.company_external_bookings where company_id = a) = 0, 'B sees nothing of A';
  select count(*) into n from public.instructor_busy_intervals(ins::uuid, pg_temp.at(0, '00:00'), pg_temp.at(10, '00:00')); assert n >= 3, 'B sees the instructor as busy';
  assert exists (select 1 from public.instructor_busy_intervals(ins::uuid, pg_temp.at(-2, '10:00'), pg_temp.at(-2, '12:00')) where starts_at = pg_temp.at(-2, '10:00') and ends_at = pg_temp.at(-2, '12:00')), 'the completed lesson stays in the historical busy intervals';
  assert not exists (select 1 from public.instructor_busy_intervals(ins::uuid, pg_temp.at(-2, '12:30'), pg_temp.at(-2, '13:30'))), 'the completed lesson does not occupy later intervals';
  select to_jsonb(x) into k from public.instructor_busy_intervals(ins::uuid, pg_temp.at(0, '00:00'), pg_temp.at(10, '00:00')) x limit 1;
  assert (select array_agg(key order by key) from jsonb_object_keys(k) key) = array['ends_at', 'starts_at'], 'only start and end: no customer, service, unit, value or code';
  begin perform public.instructor_busy_intervals(insb::uuid, pg_temp.at(0, '00:00'), pg_temp.at(1, '00:00')); raise exception 'busy time of an instructor not linked'; exception when insufficient_privilege then null; end;
  begin perform public.instructor_busy_intervals(ins::uuid, pg_temp.at(0, '00:00'), pg_temp.at(40, '00:00')); raise exception 'huge period'; exception when invalid_parameter_value then null; end;
  begin perform public.cancel_external_booking(b4, 'Tentando cancelar de fora'); raise exception 'B cancelled a booking of A'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(at_); assert (select count(*) from public.company_external_bookings where unit_id = u2) = 0, 'the attendant of U1 sees nothing of U2'; assert (select count(*) from public.company_external_bookings where unit_id = u1) >= 2, 'but sees U1'; perform pg_temp.reset();
  perform pg_temp.act_as(mg); assert (select count(*) from public.company_external_bookings where company_id = a) >= 4 and (select count(*) from public.company_services where company_id = a) = 2, 'the manager of both units sees everything of A'; perform pg_temp.reset();

  -- 10. Pacotes.
  perform pg_temp.act_as(mg); pk := public.create_package(s1, 'Pacote 5 aulas', 5, 120000, 90);
  begin perform public.create_package(s1, 'Pacote ruim', 1, 120000, 90); raise exception 'one-lesson package'; exception when check_violation then null; end;
  perform public.set_package_active(pk, false); perform pg_temp.reset();
  assert not (select active from public.company_packages where id = pk), 'deactivated';
  perform pg_temp.act_as(at_); begin perform public.create_package(s1, 'Pacote do atendente', 3, 50000, 60); raise exception 'attendant created a package'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(o2); begin perform public.set_package_active(pk, true); raise exception 'B changed a package of A'; exception when insufficient_privilege then null; end; perform pg_temp.reset();

  -- 11. Cliente nunca escreve direto; anon fechado; invariantes de catálogo.
  perform pg_temp.act_as(o1);
  begin insert into public.company_services (company_id, name, minutes, capacity) values (a, 'Direto', 60, 1); raise exception 'direct insert'; exception when insufficient_privilege then null; end;
  begin insert into public.company_external_bookings (company_id, unit_id, service_id, instructor_id, link_id, customer_name, customer_phone, starts_at, minutes, price_cents, commission_bps, commission_cents, school_cents, created_by)
    values (a, u1, s1, ins::uuid, link_a, 'Direto', '88999990000', now() + interval '30 days', 60, 1000, 5000, 500, 500, o1::uuid); raise exception 'direct booking insert'; exception when insufficient_privilege then null; end;
  begin perform public.company_instructor_is_free(ins::uuid, now(), 60, null); raise exception 'internal function callable'; exception when insufficient_privilege then null; end;
  begin perform public.company_check_slot(u1, s1, ins::uuid, now(), null); raise exception 'internal function callable'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  execute 'set role anon';
  begin perform count(*) from public.company_external_bookings; raise exception 'anon read bookings'; exception when insufficient_privilege then null; end;
  begin perform public.create_external_booking(u1, s1, ins::uuid, 'Cliente', '88999990004', now() + interval '2 days'); raise exception 'anon booked'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  assert not exists (select 1 from public.company_audit_logs where detail::text ~ '[0-9]{10,}' and action like 'booking.%'), 'the audit never stores a phone number';
end $$;

-- A regressão do fluxo digital: a função continua existindo com as mesmas permissões (ninguém além do dono do banco executa).
do $$ begin
  assert not has_function_privilege('authenticated', 'public.instructor_can_attend(uuid,jsonb)', 'EXECUTE') and not has_function_privilege('anon', 'public.instructor_can_attend(uuid,jsonb)', 'EXECUTE'), 'instructor_can_attend stays internal';
  assert (select prosecdef from pg_proc where oid = 'public.instructor_can_attend(uuid,jsonb)'::regprocedure) and (select provolatile from pg_proc where oid = 'public.instructor_can_attend(uuid,jsonb)'::regprocedure) = 's', 'still stable security definer';
  assert exists (select 1 from pg_proc p where p.oid = 'public.instructor_can_attend(uuid,jsonb)'::regprocedure and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')), 'fixed search_path';
end $$;
do $$ declare t text; begin
  foreach t in array array['company_services','company_service_prices','company_unit_services','company_unit_service_instructors','company_packages','company_external_bookings'] loop
    assert (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), t || ' has RLS';
    assert not has_table_privilege('authenticated', 'public.' || t, 'INSERT') and not has_table_privilege('authenticated', 'public.' || t, 'UPDATE') and not has_table_privilege('authenticated', 'public.' || t, 'DELETE'), t || ' is read-only for clients';
    assert not has_table_privilege('anon', 'public.' || t, 'SELECT'), t || ' is closed to anon';
  end loop;
end $$;

select 'PASS: business services and in-person bookings (frozen amounts, one calendar across units, companies and the digital flow, no leak between companies)';
