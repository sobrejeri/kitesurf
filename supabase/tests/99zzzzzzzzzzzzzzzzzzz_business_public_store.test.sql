-- Business fase 7: vitrine pública das escolas e pedidos do aluno (visitante ou logado).
\set ON_ERROR_STOP on

create function pg_temp.act_as(uid text, aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.aal', aal, false);
  execute 'set role authenticated';
end $$;
create function pg_temp.visitor() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  execute 'set role anon';
end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.aal', 'aal2', false);
end $$;
create function pg_temp.at(off integer, hhmm text) returns timestamptz language sql as $$
  select (((now() at time zone 'America/Fortaleza')::date + off + hhmm::time) at time zone 'America/Fortaleza');
$$;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000e7001', 'o1@pub.example', '{"full_name":"Dona A","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000e7002', 'o2@pub.example', '{"full_name":"Dono B","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000e7003', 'mg@pub.example', '{"full_name":"Gerente","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000e7005', 'at@pub.example', '{"full_name":"Atendente","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000e7006', 'ins@pub.example', '{"full_name":"Denilson Souza Lima","role":"instructor"}', now()),
  ('00000000-0000-0000-0000-0000000e7007', 'af1@pub.example', '{"full_name":"Pousada Brisa","role":"partner"}', now()),
  ('00000000-0000-0000-0000-0000000e7008', 'adm@pub.example', '{"full_name":"Admin","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000e7009', 'al1@pub.example', '{"full_name":"Aluna Um","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000e700a', 'al2@pub.example', '{"full_name":"Aluno Dois","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000e700b', 'al3@pub.example', '{"full_name":"Aluno Tres","role":"student"}', null);
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000e7008';
update public.instructors set status = 'approved', approved_at = now() where id = '00000000-0000-0000-0000-0000000e7006';
insert into public.partners (owner_id, name, code, beach_id, status) values ('00000000-0000-0000-0000-0000000e7007', 'Pousada Brisa', 'BRISA-77', (select id from public.beaches limit 1), 'approved');

do $$
declare
  o1 text := '00000000-0000-0000-0000-0000000e7001'; o2 text := '00000000-0000-0000-0000-0000000e7002'; mg text := '00000000-0000-0000-0000-0000000e7003';
  at_ text := '00000000-0000-0000-0000-0000000e7005'; ins text := '00000000-0000-0000-0000-0000000e7006'; af1 text := '00000000-0000-0000-0000-0000000e7007';
  adm text := '00000000-0000-0000-0000-0000000e7008'; al1 text := '00000000-0000-0000-0000-0000000e7009'; al2 text := '00000000-0000-0000-0000-0000000e700a';
  a uuid; b uuid; u1 uuid; u2 uuid; ub uuid; inv uuid; ilink uuid; svc uuid; p1 uuid; p2 uuid; e1 uuid; alink uuid; req uuid; od_staff uuid;
  cat jsonb; k jsonb; r record; n int; res record; tok text; tok2 text; num text; num2 text; items jsonb; today date := (now() at time zone 'America/Fortaleza')::date;
  item_p jsonb; item_l jsonb; item_r jsonb; slots text[]; st timestamptz; ok boolean; raised boolean; t int;
begin
  -- Preparação: loja completa na empresa A; empresa B só para isolamento.
  perform pg_temp.act_as(o1); a := public.create_company('Escola Vitrine A Ltda', 'Escola VA', '66778899000186'); perform pg_temp.reset();
  perform pg_temp.act_as(o2); b := public.create_company('Escola Vitrine B Ltda', 'Escola VB', '77889900000166'); perform pg_temp.reset();
  perform pg_temp.act_as(adm); perform public.admin_set_company_status(a, 'active', 'Documentos conferidos'); perform public.admin_set_company_status(b, 'active', 'Documentos conferidos'); perform pg_temp.reset();
  perform pg_temp.act_as(o1);
  u1 := public.create_unit(a, 'Preá Beach', 'Cruz', 'Av. da Praia, 120', null, null, '06:00', '20:00');
  u2 := public.create_unit(a, 'Jeri Centro', 'Jijoca de Jericoacoara', 'Rua Principal, 45', null, null, '06:00', '20:00');
  perform public.invite_staff(a, 'mg@pub.example', jsonb_build_array(jsonb_build_object('unit_id', u1, 'role', 'manager'), jsonb_build_object('unit_id', u2, 'role', 'manager')));
  perform public.invite_staff(a, 'at@pub.example', jsonb_build_array(jsonb_build_object('unit_id', u1, 'role', 'attendant')));
  inv := public.invite_instructor(a, 'ins@pub.example', array[u1], 5500);
  perform pg_temp.reset();
  perform pg_temp.act_as(mg); perform public.accept_company_invitation((select id from public.company_invitations where email = 'mg@pub.example')); perform pg_temp.reset();
  perform pg_temp.act_as(at_); perform public.accept_company_invitation((select id from public.company_invitations where email = 'at@pub.example')); perform pg_temp.reset();
  perform pg_temp.act_as(ins); perform public.accept_company_invitation(inv); perform public.save_my_schedule(array[0,1,2,3,4,5,6], '07:00', '18:00', 0); perform pg_temp.reset();
  select id into ilink from public.company_instructor_links where company_id = a;
  perform pg_temp.act_as(o1);
  svc := public.create_service(a, 'Aula iniciante', 120, 2, 'Primeiro contato com a pipa', 26000);
  perform public.set_unit_service(svc, u1, 'Praia do Preá, ponto 2', array[0,1,2,3,4,5,6]::smallint[], array[ilink], true);
  p1 := public.create_product(a, 'CAM-VK', 'Camiseta VentoKite', 'Vestuário', 6000, 0); p2 := public.create_product(a, 'BON-VK', 'Boné VentoKite', 'Vestuário', 4500, 0);
  perform public.record_stock_movement(u1, p1, 'in', 10, 'Estoque inicial');
  e1 := public.create_equipment(u1, 'PR-01', 'prancha', 'Prancha twin tip 138', 'bom'); perform public.set_rental_rate(a, 'prancha', 4000);
  perform public.set_store_settings(a, 'Ventos do Norte', 'Aulas em Preá', '(88) 99999-0000', 'azul');
  perform public.create_coupon(a, 'VENTO10', 'percent', 1000, 0, 60, 50);
  perform pg_temp.reset();
  perform pg_temp.act_as(af1); req := public.request_company_affiliation(a, 'Hóspedes pedem aulas'); perform pg_temp.reset();
  perform pg_temp.act_as(mg); perform public.decide_affiliate_request(req, true); perform public.set_affiliate_rate(a, null, 1000); perform pg_temp.reset();
  select id into alink from public.company_affiliate_links where company_id = a;
  item_p := jsonb_build_object('kind', 'product', 'unit_id', u1, 'product_id', p1, 'qty', 2);
  item_l := jsonb_build_object('kind', 'lesson', 'unit_id', u1, 'service_id', svc, 'instructor_id', ins, 'starts_at', pg_temp.at(3, '08:00'), 'qty', 1);
  item_r := jsonb_build_object('kind', 'rental', 'unit_id', u1, 'type', 'prancha', 'hours', 2, 'qty', 1);

  -- 1. Publicar a loja: só quem gerencia a loja; endereço válido e único; padrão é fechada.
  perform pg_temp.visitor(); assert (select count(*) from public.public_store_list()) = 0, 'by default no store is public'; begin perform public.public_store_catalog('ventos-do-norte'); raise exception 'unpublished catalog readable'; exception when no_data_found then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(at_); begin perform public.set_store_public(a, 'ventos-do-norte', true); raise exception 'attendant published'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(o2); begin perform public.set_store_public(b, 'loja-b', true); raise exception 'published before configuring'; exception when object_not_in_prerequisite_state then null; end;
  begin perform public.set_store_public(a, 'ventos-do-norte', true); raise exception 'B published A'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(mg);
  begin perform public.set_store_public(a, 'Ventos Do Norte!', true); raise exception 'bad slug'; exception when invalid_parameter_value then null; end;
  begin perform public.set_store_public(a, 'admin', true); raise exception 'reserved slug'; exception when invalid_parameter_value then null; end;
  begin perform public.set_store_public(a, 'ab', true); raise exception 'short slug'; exception when invalid_parameter_value then null; end;
  perform public.set_store_public(a, 'ventos-do-norte', true); perform pg_temp.reset();
  perform pg_temp.act_as(o2); ub := public.create_unit(b, 'Unidade B', 'Camocim', 'Orla da Barra, 8', null, null, '06:00', '20:00'); perform public.set_store_settings(b, 'Loja B', '', '88999990000', 'preto');
  begin perform public.set_store_public(b, 'ventos-do-norte', true); raise exception 'duplicate slug'; exception when unique_violation then null; end;
  perform pg_temp.reset();

  -- 2. Catálogo público: só campos permitidos.
  perform pg_temp.visitor(); cat := public.public_store_catalog('VENTOS-DO-NORTE'); perform pg_temp.reset();
  assert cat -> 'store' ->> 'name' = 'Ventos do Norte' and cat -> 'store' ->> 'whatsapp' = '88999990000', 'store header';
  assert jsonb_array_length(cat -> 'units') = 2 and jsonb_array_length(cat -> 'services') = 1 and jsonb_array_length(cat -> 'products') = 2 and jsonb_array_length(cat -> 'rentals') = 1, 'what is offered';
  assert (cat #>> '{services,0,units,0,price_cents}')::int = 26000 and (cat #>> '{services,0,units,0,instructors,0,first_name}') = 'Denilson', 'price and the instructor''s first name only';
  assert cat::text !~ 'Souza|Lima|@pub|commission|bps|cost|created_by|affiliate|8899999000[^0]', 'no surname, e-mail, commission, cost or affiliate data';
  assert (select bool_and(not (u ? 'qty')) from jsonb_array_elements(cat -> 'products') p, jsonb_array_elements(p -> 'units') u), 'stock is a yes/no, never the exact quantity';
  assert (select (u ->> 'available')::boolean from jsonb_array_elements(cat #> '{products,0,units}') u where (u ->> 'unit_id')::uuid = u1 limit 1) is not null, 'availability flag present';
  assert (select count(*) from jsonb_array_elements(cat -> 'products') p, jsonb_array_elements(p -> 'units') u where (u ->> 'available')::boolean) = 1, 'only the shirt in Preá has stock';
  assert (cat #>> '{rentals,0,units,0,available}')::int = 1 or (cat #>> '{rentals,0,units,1,available}')::int = 1, 'rentable equipment counted';
  perform pg_temp.visitor(); assert (select count(*) from public.public_store_list()) = 1 and (select slug from public.public_store_list()) = 'ventos-do-norte' and (select cities from public.public_store_list()) = array['Cruz', 'Jijoca de Jericoacoara'], 'the list shows only the published store'; perform pg_temp.reset();
  begin set role anon; perform count(*) from public.company_orders; raise exception 'anon reads orders'; exception when insufficient_privilege then reset role; end;
  begin set role anon; perform count(*) from public.company_store_settings; raise exception 'anon reads store settings'; exception when insufficient_privilege then reset role; end;
  begin set role anon; perform count(*) from public.company_products; raise exception 'anon reads products'; exception when insufficient_privilege then reset role; end;
  perform pg_temp.act_as(mg); perform public.set_unit_service(svc, u2, 'Jeri', array[0,1,2,3,4,5,6]::smallint[], '{}', false); perform pg_temp.reset();
  perform pg_temp.visitor(); cat := public.public_store_catalog('ventos-do-norte'); perform pg_temp.reset();
  assert jsonb_array_length(cat #> '{services,0,units}') = 1, 'a unit where the service is off is not offered';
  perform pg_temp.act_as(o1); perform public.update_unit(u2, 'Jeri Centro', 'Jijoca de Jericoacoara', 'Rua Principal, 45', '06:00', '20:00', false); perform pg_temp.reset();
  perform pg_temp.visitor(); cat := public.public_store_catalog('ventos-do-norte'); perform pg_temp.reset();
  assert jsonb_array_length(cat -> 'units') = 1, 'an inactive unit is hidden';
  perform pg_temp.act_as(o1); perform public.update_unit(u2, 'Jeri Centro', 'Jijoca de Jericoacoara', 'Rua Principal, 45', '06:00', '20:00', true); perform pg_temp.reset();

  -- 3. Horários livres: iguais ao que a reserva aceitaria; ocupado some, sem dizer de quem.
  perform pg_temp.visitor(); slots := public.public_free_slots('ventos-do-norte', u1, svc, ins::uuid, today + 5); perform pg_temp.reset();
  assert slots @> array['07:00', '09:30', '16:00'] and not slots @> array['06:30'] and not slots @> array['16:30'] and not slots @> array['19:00'], 'free grid inside the instructor window (07:00 to 18:00, 2 h lesson)';
  perform pg_temp.visitor(); assert public.public_free_slots('ventos-do-norte', u1, svc, ins::uuid, today) = '{}' and public.public_free_slots('ventos-do-norte', u1, svc, ins::uuid, today + 61) = '{}' and public.public_free_slots('ventos-do-norte', u1, svc, ins::uuid, today - 3) = '{}', 'no slots today, in the past or beyond 60 days'; perform pg_temp.reset();
  perform pg_temp.act_as(mg); perform public.create_external_booking(u1, svc, ins::uuid, 'Cliente Balcão', '88999990001', pg_temp.at(5, '10:00')); perform pg_temp.reset();
  perform pg_temp.visitor(); slots := public.public_free_slots('ventos-do-norte', u1, svc, ins::uuid, today + 5); perform pg_temp.reset();
  assert not slots @> array['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'] and slots @> array['08:00', '12:00'], 'a booked slot disappears (2 h lesson overlaps)';
  n := 0; for t in 0..47 loop st := (((today + 5 + make_interval(mins => t * 30))::timestamp) at time zone 'America/Fortaleza');
    ok := public.company_slot_ok(u1, svc, ins::uuid, st); raised := false;
    begin perform 1 from public.company_check_slot(u1, svc, ins::uuid, st, null); exception when others then raised := true; end;
    assert ok = not raised, 'the public check and the booking check agree at ' || st::text; n := n + 1; end loop;
  assert n = 48, 'all candidate times compared';

  -- 4. Pedido do visitante: valores do banco, mesmo núcleo da equipe, sem reservar nada.
  perform pg_temp.visitor();
  select * into res from public.create_public_order('ventos-do-norte', 'Cliente Visitante', '(88) 99999-0101', jsonb_build_array(item_p || jsonb_build_object('unit_price', 1, 'line', 1), item_l, item_r));
  perform pg_temp.reset();
  num := res.order_number; tok := res.token;
  assert num like 'VK-%' and length(tok) = 64 and res.total_cents = 46000, 'number, a 64-hex token (two UUIDs), catalog total';
  select * into r from public.company_orders where number = num;
  assert r.origin = 'vitrine' and r.status = 'received' and r.created_by is null and r.customer_id is null and r.customer_phone = '88999990101' and r.public_token_hash = encode(sha256(convert_to(tok, 'UTF8')), 'hex'), 'public order shape';
  assert not exists (select 1 from public.company_orders where public_token_hash = tok or number = tok), 'the plain token is never stored';
  assert (select qty from public.company_stock_balances where unit_id = u1 and product_id = p1) = 10, 'no stock reserved';
  perform pg_temp.act_as(at_); od_staff := public.create_order(a, 'Cliente Equipe', '88999990102', 'balcao', jsonb_build_array(item_p, item_l || jsonb_build_object('starts_at', pg_temp.at(4, '08:00')), item_r)); perform pg_temp.reset();
  assert (select (subtotal_cents, discount_cents, total_cents, affiliate_commission_cents) from public.company_orders where id = od_staff) = (select (subtotal_cents, discount_cents, total_cents, affiliate_commission_cents) from public.company_orders where number = num), 'the staff and the visitor price the same items the same way';
  assert (select created_by from public.company_orders where id = od_staff) = at_::uuid, 'the staff order still records the employee';
  perform pg_temp.visitor();
  begin perform public.create_public_order('ventos-do-norte', 'Cliente Cupom', '88999990103', jsonb_build_array(item_p), null, 'VENTO10'); raise exception 'visitor used a coupon'; exception when insufficient_privilege or sqlstate '28000' then null; end;
  begin perform public.create_public_order('nao-existe', 'Cliente', '88999990104', jsonb_build_array(item_p)); raise exception 'order in an unknown store'; exception when no_data_found then null; end;
  begin perform public.create_public_order('ventos-do-norte', 'C', '88999990104', jsonb_build_array(item_p)); raise exception 'short name'; exception when invalid_parameter_value then null; end;
  begin perform public.create_public_order('ventos-do-norte', 'Cliente Longo', '123', jsonb_build_array(item_p)); raise exception 'bad phone'; exception when invalid_parameter_value then null; end;
  begin perform public.create_public_order('ventos-do-norte', 'Cliente Longo', '88999990104', '[]'::jsonb); raise exception 'empty'; exception when invalid_parameter_value then null; end;
  begin perform public.create_public_order('ventos-do-norte', 'Cliente Longo', '88999990104', (select jsonb_agg(item_p) from generate_series(1, 11))); raise exception 'eleven items'; exception when invalid_parameter_value then null; end;
  begin perform public.create_public_order('ventos-do-norte', 'Cliente Longo', '88999990104', jsonb_build_array(item_p || jsonb_build_object('qty', 11))); raise exception 'above the stock'; exception when object_not_in_prerequisite_state then null; end;
  begin perform public.create_public_order('ventos-do-norte', 'Cliente Longo', '88999990104', jsonb_build_array(item_l || jsonb_build_object('starts_at', pg_temp.at(5, '10:00')))); raise exception 'a taken lesson time'; exception when invalid_parameter_value or sqlstate '23P01' then null; end;
  begin perform public.create_public_order('ventos-do-norte', 'Cliente Longo', '88999990104', jsonb_build_array(jsonb_build_object('kind', 'product', 'unit_id', u1, 'product_id', p1, 'qty', 1, 'price', 1))); null; end;
  perform pg_temp.reset();
  assert (select unit_price_cents from public.company_order_items i join public.company_orders o on o.id = i.order_id where o.customer_phone = '88999990104' limit 1) = 6000, 'a price sent by the visitor is ignored';
  assert (select count(*) from public.company_orders where customer_phone in ('88999990103')) = 0, 'refused orders left nothing behind';

  -- 5. Atribuição pelo código do afiliado; suspenso não recebe.
  perform pg_temp.visitor(); select * into res from public.create_public_order('ventos-do-norte', 'Cliente Afiliado', '88999990105', jsonb_build_array(item_p), 'brisa-77'); perform pg_temp.reset();
  select * into r from public.company_orders where number = res.order_number;
  assert r.affiliate_link_id = alink and r.affiliate_commission_cents = 1200 and r.total_cents = 12000, 'the affiliate code attributes the sale: 10% of 120,00 frozen';
  perform pg_temp.act_as(mg); perform public.set_affiliate_link_status(alink, 'suspended', 'Divulgação fora das regras'); perform pg_temp.reset();
  perform pg_temp.visitor(); select * into res from public.create_public_order('ventos-do-norte', 'Cliente Afiliado', '88999990106', jsonb_build_array(item_p), 'brisa-77'); perform pg_temp.reset();
  select * into r from public.company_orders where number = res.order_number;
  assert r.affiliate_link_id is null and r.affiliate_commission_cents = 0, 'a suspended affiliate earns nothing from the storefront';
  perform pg_temp.act_as(mg); perform public.set_affiliate_link_status(alink, 'active', 'Acordo reestabelecido'); perform pg_temp.reset();
  perform pg_temp.visitor(); select * into res from public.create_public_order('ventos-do-norte', 'Cliente Afiliado', '88999990107', jsonb_build_array(item_p), 'codigo-que-nao-existe'); perform pg_temp.reset();
  assert (select affiliate_link_id is null and total_cents = 12000 from public.company_orders where number = res.order_number), 'an unknown affiliate code is ignored, the order is still valid';

  -- 6. Aluno logado: cupom, customer_id, "meus pedidos".
  perform pg_temp.act_as(al1);
  select * into res from public.create_public_order('ventos-do-norte', 'Aluna Um', '(88) 99999-0201', jsonb_build_array(item_p), null, 'vento10'); num2 := res.order_number; tok2 := res.token;
  perform pg_temp.reset();
  select * into r from public.company_orders where number = num2;
  assert r.customer_id = al1::uuid and r.created_by is null and r.discount_cents = 1200 and r.total_cents = 10800, 'a logged-in student may use a coupon and the order is tied to the account';
  perform pg_temp.act_as(al1); assert (select count(*) from public.my_orders()) = 1 and (select number from public.my_orders()) = num2 and (select store_name from public.my_orders()) = 'Ventos do Norte', 'my orders'; perform pg_temp.reset();
  perform pg_temp.act_as(al2); assert (select count(*) from public.my_orders()) = 0, 'another student sees none'; perform pg_temp.reset();
  perform pg_temp.visitor(); begin perform public.my_orders(); raise exception 'a visitor called my_orders'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000e700b'); begin perform public.create_public_order('ventos-do-norte', 'Aluno Tres', '88999990203', jsonb_build_array(item_p), null, 'VENTO10'); raise exception 'unconfirmed e-mail used a coupon'; exception when sqlstate '28000' then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(adm); begin perform public.create_public_order('ventos-do-norte', 'Admin Teste', '88999990999', jsonb_build_array(item_p)); raise exception 'platform admin ordered'; exception when insufficient_privilege then null; end; perform pg_temp.reset();

  -- 7. Acompanhar: token (visitante) ou conta; nada de comissão, custo ou telefone; erro idêntico para tudo que falha.
  perform pg_temp.visitor(); k := public.get_public_order(num, tok); perform pg_temp.reset();
  assert k ->> 'number' = num and k ->> 'status' = 'received' and (k ->> 'total_cents')::int = 46000 and jsonb_array_length(k -> 'items') = 3 and (k ->> 'cancellable')::boolean, 'tracking with the token';
  assert k::text !~ 'affiliate|bps|commission|phone|88999990101|created_by|customer|instructor', 'no commission, phone or internal ids';
  assert (select array_agg(x ->> 'name' order by x ->> 'name') from jsonb_array_elements(k -> 'items') x) = array['Aluguel de prancha', 'Aula iniciante', 'Camiseta VentoKite'], 'readable item names';
  perform pg_temp.visitor(); begin perform public.get_public_order(num, null); raise exception 'no token'; exception when no_data_found then null; end;
  begin perform public.get_public_order(num, tok2); raise exception 'token of another order'; exception when no_data_found then null; end;
  begin perform public.get_public_order('VK-999999', tok); raise exception 'unknown number'; exception when no_data_found then null; end;
  begin perform public.get_public_order(num, repeat('0', 64)); raise exception 'wrong token'; exception when no_data_found then assert sqlerrm = 'Order not found'; end; perform pg_temp.reset();
  perform pg_temp.act_as(al1); k := public.get_public_order(num2, null); assert k ->> 'number' = num2, 'the logged-in student tracks without a token'; perform pg_temp.reset();
  perform pg_temp.act_as(al2); begin perform public.get_public_order(num2, null); raise exception 'another student read it'; exception when no_data_found then null; end; perform pg_temp.reset();

  -- 8. Cancelar: só recebido; o cupom usado não volta; depois que a escola começou, não.
  perform pg_temp.visitor();
  begin perform public.cancel_public_order(num2, tok, 'Quero cancelar'); raise exception 'cancelled with the token of another order'; exception when no_data_found then null; end;
  begin perform public.cancel_public_order(num, tok, 'x'); raise exception 'cancel without a reason'; exception when invalid_parameter_value then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(mg); perform public.set_order_status((select id from public.company_orders where number = num), 'confirmed'); perform pg_temp.reset();
  perform pg_temp.visitor(); begin perform public.cancel_public_order(num, tok, 'Desisti da compra'); raise exception 'cancelled after the school confirmed'; exception when object_not_in_prerequisite_state then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(al1); perform public.cancel_public_order(num2, null, 'Mudei de ideia'); perform pg_temp.reset();
  assert (select status from public.company_orders where number = num2) = 'cancelled' and (select cancel_reason from public.company_orders where number = num2) like 'Cliente:%' and (select used from public.company_coupons where company_id = a and code = 'VENTO10') = 1, 'cancelled by the customer; the coupon use is not returned';
  perform pg_temp.visitor(); k := public.get_public_order(res.order_number, res.token); perform pg_temp.reset();

  -- 9. A equipe vê os pedidos públicos; outra empresa não.
  perform pg_temp.act_as(at_); assert exists (select 1 from public.company_orders where number = num and origin = 'vitrine' and customer_name = 'Cliente Visitante'), 'the school sees the public order and who made it'; perform pg_temp.reset();
  perform pg_temp.act_as(o2); assert (select count(*) from public.company_orders where company_id = a) = 0, 'B sees nothing of A''s orders'; begin perform public.get_public_order(num, null); raise exception 'B tracked an order of A without the token'; exception when no_data_found then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(o1); perform public.set_store_public(a, 'ventos-do-norte', false); perform pg_temp.reset();
  perform pg_temp.visitor();
  begin perform public.public_store_catalog('ventos-do-norte'); raise exception 'catalog after unpublishing'; exception when no_data_found then null; end;
  begin perform public.create_public_order('ventos-do-norte', 'Cliente Longo', '88999990106', jsonb_build_array(item_p)); raise exception 'order after unpublishing'; exception when no_data_found then null; end;
  assert public.get_public_order(num, tok) ->> 'number' = num, 'a customer still tracks an order after the store is unpublished';
  perform pg_temp.reset();
  perform pg_temp.act_as(o1); perform public.set_store_public(a, 'ventos-do-norte', true); perform pg_temp.reset();

  -- 9b. Isolamento entre empresas e unidades: nada de uma loja entra no pedido de outra, nem uma unidade usa a outra.
  declare pb uuid; svcb uuid; n0 integer; n1 integer; used_a integer; stock_a integer; bres record; raised2 boolean;
  begin
    perform pg_temp.act_as(o2);
    pb := public.create_product(b, 'BON-B', 'Produto da B', 'Outros', 1000, 0);
    perform public.record_stock_movement(ub, pb, 'in', 5, 'Estoque inicial B');
    svcb := public.create_service(b, 'Aula da B', 60, 2, 'Aula da escola B', 9000);
    perform public.create_coupon(b, 'BCUPOM', 'percent', 1000, 0, 60, 50);
    perform public.set_store_public(b, 'loja-b', true);
    perform pg_temp.reset();
    select count(*) into n0 from public.company_orders;
    select used into used_a from public.company_coupons where company_id = a and code = 'VENTO10';
    select qty into stock_a from public.company_stock_balances where unit_id = u1 and product_id = p1;

    perform pg_temp.visitor();
    -- Loja de A recebendo coisas de B.
    begin perform public.create_public_order('ventos-do-norte', 'Cliente Cruzado', '88999990501', jsonb_build_array(jsonb_build_object('kind', 'product', 'unit_id', u1, 'product_id', pb, 'qty', 1))); raise exception 'product of B in the store of A';
      exception when invalid_parameter_value then assert sqlerrm = 'Product not available', 'B product refused by company: ' || sqlerrm; end;
    begin perform public.create_public_order('ventos-do-norte', 'Cliente Cruzado', '88999990501', jsonb_build_array(jsonb_build_object('kind', 'product', 'unit_id', ub, 'product_id', p1, 'qty', 1))); raise exception 'unit of B in the store of A';
      exception when invalid_parameter_value then assert sqlerrm = 'Unit not available', 'B unit refused by company: ' || sqlerrm; end;
    begin perform public.create_public_order('ventos-do-norte', 'Cliente Cruzado', '88999990501', jsonb_build_array(jsonb_build_object('kind', 'product', 'unit_id', ub, 'product_id', pb, 'qty', 1))); raise exception 'unit and product of B in the store of A';
      exception when invalid_parameter_value then assert sqlerrm = 'Unit not available', 'B unit and product refused: ' || sqlerrm; end;
    begin perform public.create_public_order('ventos-do-norte', 'Cliente Cruzado', '88999990501', jsonb_build_array(jsonb_build_object('kind', 'lesson', 'unit_id', u1, 'service_id', svcb, 'instructor_id', ins, 'starts_at', pg_temp.at(6, '08:00')))); raise exception 'service of B in the store of A';
      exception when invalid_parameter_value then assert sqlerrm = 'Service not available', 'B service refused by company: ' || sqlerrm; end;
    -- Loja de B recebendo coisas de A.
    begin perform public.create_public_order('loja-b', 'Cliente Cruzado', '88999990502', jsonb_build_array(jsonb_build_object('kind', 'product', 'unit_id', ub, 'product_id', p1, 'qty', 1))); raise exception 'product of A in the store of B';
      exception when invalid_parameter_value then assert sqlerrm = 'Product not available', 'A product refused by company: ' || sqlerrm; end;
    begin perform public.create_public_order('loja-b', 'Cliente Cruzado', '88999990502', jsonb_build_array(jsonb_build_object('kind', 'product', 'unit_id', u1, 'product_id', pb, 'qty', 1))); raise exception 'unit of A in the store of B';
      exception when invalid_parameter_value then assert sqlerrm = 'Unit not available', 'A unit refused by company: ' || sqlerrm; end;
    begin perform public.create_public_order('loja-b', 'Cliente Cruzado', '88999990502', jsonb_build_array(jsonb_build_object('kind', 'rental', 'unit_id', ub, 'type', 'prancha', 'hours', 1, 'qty', 1))); raise exception 'rental rate of A used by B';
      exception when no_data_found then null; end;
    -- Unidade sem o serviço habilitado para o instrutor: nada é criado.
    raised2 := false;
    begin perform public.create_public_order('ventos-do-norte', 'Cliente Cruzado', '88999990503', jsonb_build_array(item_l || jsonb_build_object('unit_id', u2, 'starts_at', pg_temp.at(6, '09:00')))); exception when others then raised2 := true; end;
    assert raised2, 'a lesson in a unit where the instructor is not enabled for the service is refused';
    perform pg_temp.reset();

    -- Cupom de uma empresa não vale na outra (cupom exige conta com e-mail confirmado).
    perform pg_temp.act_as(al1);
    begin perform public.create_public_order('ventos-do-norte', 'Aluna Um', '88999990504', jsonb_build_array(item_p), null, 'BCUPOM'); raise exception 'coupon of B used in A';
      exception when invalid_parameter_value then assert sqlerrm = 'Coupon not found', 'coupon of B refused in A: ' || sqlerrm; end;
    begin perform public.create_public_order('loja-b', 'Aluna Um', '88999990504', jsonb_build_array(jsonb_build_object('kind', 'product', 'unit_id', ub, 'product_id', pb, 'qty', 1)), null, 'VENTO10'); raise exception 'coupon of A used in B';
      exception when invalid_parameter_value then assert sqlerrm = 'Coupon not found', 'coupon of A refused in B: ' || sqlerrm; end;
    perform pg_temp.reset();

    -- Código de afiliado de A não atribui venda de B; o pedido legítimo de B só toca em B.
    perform pg_temp.visitor();
    select * into bres from public.create_public_order('loja-b', 'Cliente B', '88999990505', jsonb_build_array(jsonb_build_object('kind', 'product', 'unit_id', ub, 'product_id', pb, 'qty', 2)), 'brisa-77');
    perform pg_temp.reset();
    assert (select company_id = b and affiliate_link_id is null and affiliate_commission_cents = 0 and total_cents = 2000 from public.company_orders where number = bres.order_number), 'B order priced by B, with no affiliate of A attributed';
    select count(*) into n1 from public.company_orders;
    assert n1 = n0 + 1, 'every cross-company attempt left nothing behind; only the legitimate order of B exists';
    assert (select used from public.company_coupons where company_id = a and code = 'VENTO10') = used_a and (select used from public.company_coupons where company_id = b and code = 'BCUPOM') = 0, 'no coupon use was consumed by a refused order';
    assert (select qty from public.company_stock_balances where unit_id = u1 and product_id = p1) = stock_a, 'the stock of A is untouched by B';

    -- O catálogo de cada loja mostra só os dados da própria empresa.
    perform pg_temp.visitor();
    cat := public.public_store_catalog('ventos-do-norte');
    assert cat::text !~ 'Produto da B|Loja B|Unidade B|Aula da B|Camocim', 'the catalog of A has nothing of B';
    cat := public.public_store_catalog('loja-b');
    assert cat::text ~ 'Produto da B' and cat::text !~ 'Camiseta|Ventos do Norte|Aula iniciante|Preá|prancha', 'the catalog of B has nothing of A';
    perform pg_temp.reset();

    -- Perfis: a equipe de A não opera pedidos de B, e o atendente da unidade 1 não opera a unidade 2.
    perform pg_temp.act_as(at_);
    begin perform public.create_order(b, 'Equipe de A', '88999990506', 'balcao', jsonb_build_array(jsonb_build_object('kind', 'product', 'unit_id', ub, 'product_id', pb, 'qty', 1))); raise exception 'staff of A ordered in B';
      exception when insufficient_privilege then null; end;
    begin perform public.create_order(a, 'Atendente', '88999990507', 'balcao', jsonb_build_array(item_p || jsonb_build_object('unit_id', u2))); raise exception 'attendant of unit 1 ordered in unit 2';
      exception when insufficient_privilege then null; end;
    assert (select count(*) from public.company_orders where company_id = b) = 0, 'staff of A sees no order of B';
    begin perform public.get_public_order(bres.order_number, null); raise exception 'staff of A tracked an order of B'; exception when no_data_found then null; end;
    perform pg_temp.reset();
    perform pg_temp.act_as(o2); assert (select count(*) from public.company_orders where company_id = b) = 1 and (select count(*) from public.company_orders where company_id = a) = 0, 'the owner of B sees only the orders of B'; perform pg_temp.reset();
  end;

  -- 10. Limites contra abuso.
  perform pg_temp.visitor();
  perform public.create_public_order('ventos-do-norte', 'Cliente Limite', '88999990301', jsonb_build_array(item_p));
  perform public.create_public_order('ventos-do-norte', 'Cliente Limite', '88999990301', jsonb_build_array(item_p));
  perform public.create_public_order('ventos-do-norte', 'Cliente Limite', '88999990301', jsonb_build_array(item_p));
  begin perform public.create_public_order('ventos-do-norte', 'Cliente Limite', '88999990301', jsonb_build_array(item_p)); raise exception 'fourth order from one phone in an hour'; exception when sqlstate '54000' then assert sqlerrm like 'Too many requests%'; end;
  perform public.create_public_order('ventos-do-norte', 'Outro Cliente', '88999990302', jsonb_build_array(item_p));
  perform pg_temp.reset();
  assert (select count(*) from public.company_orders where customer_phone = '88999990301') = 3, 'exactly three from the limited phone';
  -- Limite de pedidos públicos em aberto: 300 pedidos antigos ainda "recebidos" fecham a vitrine; quando a escola os atende, volta.
  insert into public.company_orders (company_id, customer_name, customer_phone, origin, subtotal_cents, total_cents, created_at) select a, 'Aberto ' || g, '8899997' || lpad(g::text, 4, '0'), 'vitrine', 100, 100, now() - interval '3 days' from generate_series(1, 300) g;
  perform pg_temp.visitor(); begin perform public.create_public_order('ventos-do-norte', 'Cliente Novo', '88999990402', jsonb_build_array(item_p)); raise exception 'open orders cap'; exception when sqlstate '54000' then null; end; perform pg_temp.reset();
  update public.company_orders set status = 'delivered', delivered_at = now() where customer_name like 'Aberto %';
  perform pg_temp.visitor(); perform public.create_public_order('ventos-do-norte', 'Cliente Novo', '88999990402', jsonb_build_array(item_p)); perform pg_temp.reset();
  -- Limite por empresa por hora: 56 pedidos recentes somados aos já feitos passam de 60.
  insert into public.company_orders (company_id, customer_name, customer_phone, origin, subtotal_cents, total_cents, status) select a, 'Carga ' || g, '8899998' || lpad(g::text, 4, '0'), 'vitrine', 100, 100, 'delivered' from generate_series(1, 56) g;
  perform pg_temp.visitor(); begin perform public.create_public_order('ventos-do-norte', 'Cliente Novo', '88999990403', jsonb_build_array(item_p)); raise exception 'company hourly cap'; exception when sqlstate '54000' then null; end; perform pg_temp.reset();

  -- 11. Congelado e sem escrita direta; anon fechado.
  begin update public.company_orders set public_token_hash = repeat('a', 64) where number = num; raise exception 'token hash edited'; exception when insufficient_privilege then null; end;
  begin update public.company_orders set customer_id = al2::uuid where number = num2; raise exception 'owner changed'; exception when insufficient_privilege then null; end;
  perform pg_temp.visitor();
  begin perform public.create_order(a, 'Visitante', '88999990999', 'balcao', jsonb_build_array(item_p)); raise exception 'visitor called the staff function'; exception when others then assert sqlstate in ('42501', '28000'); end;
  begin perform public.company_place_order(a, 'Visitante', '88999990999', 'balcao', jsonb_build_array(item_p), null, null, false, null, null); raise exception 'visitor called the internal core'; exception when insufficient_privilege then null; end;
  begin perform public.company_slot_ok(u1, svc, ins::uuid, now()); raise exception 'visitor called an internal check'; exception when insufficient_privilege then null; end;
  begin perform public.set_store_public(a, 'invasao', true); raise exception 'visitor published'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  assert exists (select 1 from public.company_audit_logs where company_id = a and action = 'order.created' and actor_id is null and detail ->> 'public' = 'true'), 'anonymous orders are audited with no actor';
  assert not exists (select 1 from public.company_audit_logs where company_id = a and action like 'order.%' and detail::text ~ 'Cliente|8899999'), 'the audit stores no customer data';
  assert not exists (select 1 from public.company_orders o where o.total_cents <> o.subtotal_cents - o.discount_cents or o.discount_cents <> coalesce((select sum(i.discount_cents) from public.company_order_items i where i.order_id = o.id), o.discount_cents)), 'every order reconciles';
end $$;

do $$ declare f text; begin
  foreach f in array array['company_place_order','company_slot_ok','company_published_id','set_store_public','public_store_list','public_store_catalog','public_free_slots','create_public_order','get_public_order','cancel_public_order','my_orders'] loop
    assert (select bool_and(p.prosecdef and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f), f || ' is definer with a fixed search_path';
  end loop;
  assert not has_function_privilege('anon', 'public.company_place_order(uuid,text,text,public.company_order_origin,jsonb,text,text,boolean,uuid,text)', 'EXECUTE')
     and not has_function_privilege('authenticated', 'public.company_place_order(uuid,text,text,public.company_order_origin,jsonb,text,text,boolean,uuid,text)', 'EXECUTE')
     and not has_function_privilege('anon', 'public.create_order(uuid,text,text,public.company_order_origin,jsonb,text,text)', 'EXECUTE')
     and not has_function_privilege('anon', 'public.set_store_public(uuid,text,boolean)', 'EXECUTE') and not has_function_privilege('anon', 'public.my_orders()', 'EXECUTE')
     and has_function_privilege('anon', 'public.create_public_order(text,text,text,jsonb,text,text)', 'EXECUTE') and has_function_privilege('anon', 'public.public_store_catalog(text)', 'EXECUTE'), 'what anon can and cannot execute';
  assert not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon' and table_name like any (array['company\_%', 'companies'])), 'anon has no table grants on Business tables';
end $$;

select 'PASS: business public store (published-only, safe catalog, visitor and student orders priced by the staff core, token tracking, limits, no leaks)';
