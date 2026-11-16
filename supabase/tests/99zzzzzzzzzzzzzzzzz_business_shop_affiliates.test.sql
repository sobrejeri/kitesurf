-- Business fase 5: lojinha (cupons, pedidos com preço congelado) e afiliados da empresa.
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
create function pg_temp.at(off integer, hhmm text) returns timestamptz language sql as $$
  select (((now() at time zone 'America/Fortaleza')::date + off + hhmm::time) at time zone 'America/Fortaleza');
$$;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000c5001', 'o1@shop.example', '{"full_name":"Dona A","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000c5002', 'o2@shop.example', '{"full_name":"Dono B","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000c5003', 'mg@shop.example', '{"full_name":"Gerente","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000c5004', 'fi@shop.example', '{"full_name":"Financeiro","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000c5005', 'at@shop.example', '{"full_name":"Atendente","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000c5006', 'ins@shop.example', '{"full_name":"Instrutor","role":"instructor"}', now()),
  ('00000000-0000-0000-0000-0000000c5007', 'af1@shop.example', '{"full_name":"Pousada Brisa","role":"partner"}', now()),
  ('00000000-0000-0000-0000-0000000c5008', 'adm@shop.example', '{"full_name":"Admin","role":"student"}', now()),
  ('00000000-0000-0000-0000-0000000c5009', 'af2@shop.example', '{"full_name":"Loja Kite","role":"partner"}', now());
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000c5008';
update public.instructors set status = 'approved', approved_at = now() where id = '00000000-0000-0000-0000-0000000c5006';
insert into public.partners (owner_id, name, code, beach_id, status) values
  ('00000000-0000-0000-0000-0000000c5007', 'Pousada Brisa', 'BRISA-55', (select id from public.beaches limit 1), 'approved'),
  ('00000000-0000-0000-0000-0000000c5009', 'Loja Kite', 'LOJAK-55', (select id from public.beaches limit 1), 'approved');

do $$
declare
  o1 text := '00000000-0000-0000-0000-0000000c5001'; o2 text := '00000000-0000-0000-0000-0000000c5002'; mg text := '00000000-0000-0000-0000-0000000c5003';
  fi text := '00000000-0000-0000-0000-0000000c5004'; at_ text := '00000000-0000-0000-0000-0000000c5005'; ins text := '00000000-0000-0000-0000-0000000c5006';
  af1 text := '00000000-0000-0000-0000-0000000c5007'; af2 text := '00000000-0000-0000-0000-0000000c5009'; adm text := '00000000-0000-0000-0000-0000000c5008';
  a uuid; b uuid; u1 uuid; u2 uuid; inv uuid; ilink uuid; svc uuid; p1 uuid; pb uuid; p_cent uuid; e1 uuid; req uuid; req2 uuid; alink uuid; cp uuid;
  od1 uuid; od2 uuid; od3 uuid; od4 uuid; od5 uuid; od6 uuid; r record; n int; k jsonb; today date := (now() at time zone 'America/Fortaleza')::date;
  item_p jsonb; item_l jsonb; item_r jsonb; n1 text; n4 text;
begin
  -- Preparação.
  perform pg_temp.act_as(o1); a := public.create_company('Escola Loja A Ltda', 'Escola LA', '22334455000186'); perform pg_temp.reset();
  perform pg_temp.act_as(o2); b := public.create_company('Escola Loja B Ltda', 'Escola LB', '33445566000186'); perform pg_temp.reset();
  perform pg_temp.act_as(adm); perform public.admin_set_company_status(a, 'active', 'Documentos conferidos'); perform public.admin_set_company_status(b, 'active', 'Documentos conferidos'); perform pg_temp.reset();
  perform pg_temp.act_as(o1);
  u1 := public.create_unit(a, 'Preá Beach', 'Cruz', 'Av. da Praia, 120', null, null, '06:00', '20:00');
  u2 := public.create_unit(a, 'Jeri Centro', 'Jijoca de Jericoacoara', 'Rua Principal, 45', null, null, '06:00', '20:00');
  perform public.invite_staff(a, 'mg@shop.example', jsonb_build_array(jsonb_build_object('unit_id', u1, 'role', 'manager'), jsonb_build_object('unit_id', u2, 'role', 'manager')));
  perform public.invite_staff(a, 'fi@shop.example', jsonb_build_array(jsonb_build_object('unit_id', u1, 'role', 'finance')));
  perform public.invite_staff(a, 'at@shop.example', jsonb_build_array(jsonb_build_object('unit_id', u1, 'role', 'attendant')));
  inv := public.invite_instructor(a, 'ins@shop.example', array[u1, u2], 5500);
  perform pg_temp.reset();
  perform pg_temp.act_as(mg); perform public.accept_company_invitation((select id from public.company_invitations where email = 'mg@shop.example')); perform pg_temp.reset();
  perform pg_temp.act_as(fi); perform public.accept_company_invitation((select id from public.company_invitations where email = 'fi@shop.example')); perform pg_temp.reset();
  perform pg_temp.act_as(at_); perform public.accept_company_invitation((select id from public.company_invitations where email = 'at@shop.example')); perform pg_temp.reset();
  perform pg_temp.act_as(ins); perform public.accept_company_invitation(inv); perform public.save_my_schedule(array[0,1,2,3,4,5,6], '07:00', '18:00', 0); perform pg_temp.reset();
  select id into ilink from public.company_instructor_links where company_id = a;
  perform pg_temp.act_as(o1);
  svc := public.create_service(a, 'Aula iniciante', 120, 2, '', 26000);
  perform public.set_unit_service(svc, u1, 'Praia', array[0,1,2,3,4,5,6]::smallint[], array[ilink], true);
  p1 := public.create_product(a, 'CAM-VK', 'Camiseta VentoKite', 'Vestuário', 6000, 0);
  perform public.record_stock_movement(u1, p1, 'in', 10, 'Estoque inicial'); perform public.record_stock_movement(u2, p1, 'in', 5, 'Estoque inicial');
  e1 := public.create_equipment(u1, 'PR-01', 'prancha', 'Prancha twin tip 138', 'bom'); perform public.set_rental_rate(a, 'prancha', 4000);
  perform pg_temp.reset();
  perform pg_temp.act_as(o2); perform public.create_unit(b, 'Unidade B', 'Camocim', 'Orla da Barra, 8', null, null, '06:00', '20:00'); pb := public.create_product(b, 'CAM-B', 'Camiseta B', '', 5000, 0); perform pg_temp.reset();
  item_p := jsonb_build_object('kind', 'product', 'unit_id', u1, 'product_id', p1, 'qty', 2);
  item_l := jsonb_build_object('kind', 'lesson', 'unit_id', u1, 'service_id', svc, 'instructor_id', ins, 'starts_at', pg_temp.at(3, '08:00'), 'qty', 1);
  item_r := jsonb_build_object('kind', 'rental', 'unit_id', u1, 'type', 'prancha', 'hours', 2, 'qty', 1);

  -- 1. Configuração da loja.
  perform pg_temp.act_as(mg); perform public.set_store_settings(a, 'Ventos do Norte', 'Aulas em Preá', '(88) 99999-0000', 'azul');
  begin perform public.set_store_settings(a, 'Ventos do Norte', '', '88999990000', 'rosa'); raise exception 'bad accent'; exception when check_violation then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(at_); begin perform public.set_store_settings(a, 'Atendente', '', '88999990000', 'azul'); raise exception 'attendant set the store'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  assert (select whatsapp from public.company_store_settings where company_id = a) = '88999990000', 'digits only';

  -- 2. Afiliação: só afiliado aprovado pede; a empresa decide; recusar exige motivo.
  perform pg_temp.act_as(at_); begin perform public.request_company_affiliation(a, 'Não sou afiliado'); raise exception 'non-affiliate requested'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(af1); req := public.request_company_affiliation(a, 'Hóspedes pedem aulas');
  begin perform public.request_company_affiliation(a, 'De novo'); raise exception 'duplicate pending'; exception when unique_violation then null; end;
  begin perform public.decide_affiliate_request(req, true); raise exception 'affiliate approved itself'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(af2); req2 := public.request_company_affiliation(a, 'Quero vender'); perform pg_temp.reset();
  perform pg_temp.act_as(at_); begin perform public.decide_affiliate_request(req, true); raise exception 'attendant decided'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(mg);
  begin perform public.decide_affiliate_request(req2, false, ' '); raise exception 'declined without reason'; exception when invalid_parameter_value then null; end;
  perform public.decide_affiliate_request(req2, false, 'Fora da área de atendimento');
  perform public.decide_affiliate_request(req, true);
  begin perform public.decide_affiliate_request(req, false, 'Mudando de ideia'); raise exception 'decided twice'; exception when object_not_in_prerequisite_state then null; end;
  perform pg_temp.reset();
  select id into alink from public.company_affiliate_links where company_id = a;
  assert (select code from public.company_affiliate_links where id = alink) = 'BRISA-55', 'the tracking code is the affiliate''s own code';
  perform pg_temp.act_as(af1); assert (select count(*) from public.company_affiliate_links) = 1 and (select count(*) from public.company_affiliate_requests) = 1, 'the affiliate sees only its own'; perform pg_temp.reset();
  perform pg_temp.act_as(af2); assert (select count(*) from public.company_affiliate_links) = 0, 'a declined affiliate has no link'; perform pg_temp.reset();

  -- 3. Percentuais em versões. (Versão padrão antiga inserida direto, para provar a não retroatividade.)
  insert into public.company_affiliate_rates (company_id, ref_id, bps, from_date, created_by) values (a, null, 1000, today - 30, o1::uuid);
  perform pg_temp.act_as(mg);
  begin perform public.set_affiliate_rate(a, pb, 1500); raise exception 'rate for a product of another company'; exception when invalid_parameter_value then null; end;
  begin perform public.set_affiliate_rate(a, null, 4000); raise exception 'rate above 30%%'; exception when check_violation then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(at_); begin perform public.set_affiliate_rate(a, null, 1200); raise exception 'attendant set a rate'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(af1); assert (select count(*) from public.company_affiliate_rates) = 1, 'a linked affiliate reads the rates'; perform pg_temp.reset();
  perform pg_temp.act_as(af2); assert (select count(*) from public.company_affiliate_rates) = 0, 'an unlinked one does not'; perform pg_temp.reset();

  -- 4. Seleção do afiliado e campanhas.
  perform pg_temp.act_as(af1); perform public.set_my_affiliate_selection(alink, array[svc, p1, p1]);
  begin perform public.set_my_affiliate_selection(alink, array[pb]); raise exception 'selected a product of another company'; exception when invalid_parameter_value then null; end;
  perform pg_temp.reset();
  assert (select count(*) from public.company_affiliate_selections where link_id = alink) = 2, 'selection saved without duplicates';
  perform pg_temp.act_as(af2); begin perform public.set_my_affiliate_selection(alink, array[svc]); raise exception 'another affiliate changed the selection'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(mg); begin perform public.set_my_affiliate_selection(alink, array[svc]); raise exception 'the company chose for the affiliate'; exception when insufficient_privilege then null; end;
  perform public.create_campaign(a, 'Verão em Preá', 'Aula e camiseta', 30, array[svc, p1]);
  begin perform public.create_campaign(a, 'Vazia', '', 30, '{}'); raise exception 'campaign without items'; exception when invalid_parameter_value then null; end;
  perform pg_temp.reset();

  -- 5. Cupons.
  perform pg_temp.act_as(mg);
  perform public.create_coupon(a, 'vento10', 'percent', 1000, 0, 60, 2);
  perform public.create_coupon(a, 'PREA20', 'fixed', 2000, 15000, 30, 20, array[u1]);
  cp := public.create_coupon(a, 'AFI5', 'percent', 500, 0, 30, 50, null, alink);
  perform public.create_coupon(a, 'PAUSA', 'fixed', 1000, 0, 30, 10);
  perform public.create_coupon(a, 'VELHO', 'fixed', 1000, 0, 30, 10);
  begin perform public.create_coupon(a, 'VENTO10', 'percent', 1000, 0, 60, 2); raise exception 'duplicate code'; exception when unique_violation then null; end;
  begin perform public.create_coupon(a, 'MUITO', 'percent', 9000, 0, 60, 2); raise exception 'percent above 50'; exception when check_violation then null; end;
  begin perform public.create_coupon(a, 'a b', 'fixed', 1000, 0, 60, 2); raise exception 'bad code'; exception when check_violation then null; end;
  perform public.set_coupon_active((select id from public.company_coupons where code = 'PAUSA'), false);
  perform pg_temp.reset();
  update public.company_coupons set until_date = today - 1 where code = 'VELHO';
  perform pg_temp.act_as(at_); begin perform public.create_coupon(a, 'ATEND', 'fixed', 1000, 0, 60, 2); raise exception 'attendant created a coupon'; exception when insufficient_privilege then null; end; perform pg_temp.reset();

  -- 6. Pedido: valores do banco, desconto repartido exato, comissão congelada.
  perform pg_temp.act_as(at_);
  od1 := public.create_order(a, 'Cliente Um', '(88) 99999-0001', 'afiliado', jsonb_build_array(item_p || jsonb_build_object('unit_price', 1, 'line', 1, 'discount', 99999), item_l, item_r), 'vento10', 'brisa-55');
  perform pg_temp.reset();
  select * into r from public.company_orders where id = od1;
  assert (r.subtotal_cents, r.discount_cents, r.total_cents, r.affiliate_commission_cents) = (46000, 4600, 41400, 4140), 'catalog prices, 10% once, commission on the net of each item';
  assert r.affiliate_link_id = alink and r.status = 'received' and r.customer_phone = '88999990001' and r.number like 'VK-%', 'attribution by the affiliate code';
  assert (select array_agg(discount_cents order by id) from public.company_order_items where order_id = od1) = array[1200, 2600, 800], 'shares add up exactly; the last takes the rest';
  assert (select sum(discount_cents) from public.company_order_items where order_id = od1) = r.discount_cents and (select sum(line_cents) from public.company_order_items where order_id = od1) = r.subtotal_cents, 'items reconcile with the order';
  assert (select bool_and(affiliate_bps = 1000) from public.company_order_items where order_id = od1), 'rate in force frozen on each item';
  assert (select qty from public.company_stock_balances where unit_id = u1 and product_id = p1) = 10, 'an order does not move stock';

  -- 6b. Divisão com resto: 1000 sobre 12000 + 26000 + 8000 dá 260 + 565 e o último fica com 175 (não 173).
  perform pg_temp.act_as(mg); perform public.create_coupon(a, 'RESTO', 'fixed', 1000, 0, 30, 5); perform pg_temp.reset();
  perform pg_temp.act_as(at_); od3 := public.create_order(a, 'Cliente Resto', '88999990007', 'balcao', jsonb_build_array(item_p, item_l, item_r), 'RESTO'); perform pg_temp.reset();
  assert (select array_agg(discount_cents order by id) from public.company_order_items where order_id = od3) = array[260, 565, 175], 'the remainder goes to the last covered item';
  assert (select discount_cents from public.company_orders where id = od3) = 1000 and (select sum(discount_cents) from public.company_order_items where order_id = od3) = 1000, 'never a cent lost';

  -- 6c. Cupom de 299 centavos em três itens de 100: o último não pode receber 101.
  perform pg_temp.act_as(o1);
  p_cent := public.create_product(a, 'CUP-01', 'Item de teste', '', 100, 0);
  perform public.record_stock_movement(u1, p_cent, 'in', 3, 'Estoque inicial');
  perform public.create_coupon(a, 'QUASETOTAL', 'fixed', 299, 0, 30, 5);
  perform pg_temp.reset();
  perform pg_temp.act_as(at_);
  k := jsonb_build_object('kind', 'product', 'unit_id', u1, 'product_id', p_cent, 'qty', 1);
  od3 := public.create_order(a, 'Cliente Cupom', '88999990007', 'balcao', jsonb_build_array(k, k, k), 'QUASETOTAL');
  perform pg_temp.reset();
  assert (select array_agg(discount_cents order by id) from public.company_order_items where order_id = od3) = array[99, 100, 100], 'the excess remainder moves to the previous covered item';
  assert (select total_cents from public.company_orders where id = od3) = 1, 'exact remainder on a nearly free order';

  -- 7. Várias unidades: cupom só cobre a unidade dele; cada unidade vê os seus itens.
  perform pg_temp.act_as(mg);
  begin perform public.create_order(a, 'Cliente Dois', '88999990002', 'vitrine', jsonb_build_array(jsonb_build_object('kind', 'product', 'unit_id', u1, 'product_id', p1, 'qty', 1), jsonb_build_object('kind', 'product', 'unit_id', u2, 'product_id', p1, 'qty', 3)), 'PREA20');
    raise exception 'coupon minimum counted the uncovered unit'; exception when invalid_parameter_value then null; end;
  od2 := public.create_order(a, 'Cliente Dois', '88999990002', 'vitrine', jsonb_build_array(jsonb_build_object('kind', 'product', 'unit_id', u1, 'product_id', p1, 'qty', 3), jsonb_build_object('kind', 'product', 'unit_id', u2, 'product_id', p1, 'qty', 1)), 'PREA20');
  perform pg_temp.reset();
  select * into r from public.company_orders where id = od2;
  assert (r.subtotal_cents, r.discount_cents, r.total_cents, r.affiliate_commission_cents) = (24000, 2000, 22000, 0) and r.affiliate_link_id is null, 'fixed coupon on the covered unit only; no affiliate, no commission';
  assert (select discount_cents from public.company_order_items where order_id = od2 and unit_id = u1) = 2000 and (select discount_cents from public.company_order_items where order_id = od2 and unit_id = u2) = 0, 'the uncovered unit gets no discount';
  perform pg_temp.act_as(at_);
  assert (select count(*) from public.company_orders where id = od2) = 1 and (select count(*) from public.company_order_items where order_id = od2) = 1, 'the attendant of U1 sees the order and only the U1 item';
  begin perform public.create_order(a, 'Cliente', '88999990003', 'balcao', jsonb_build_array(jsonb_build_object('kind', 'product', 'unit_id', u2, 'product_id', p1, 'qty', 1))); raise exception 'ordered in a unit without access'; exception when insufficient_privilege then null; end;

  -- 8. Disponibilidade e validações.
  begin perform public.create_order(a, 'Cliente', '88999990003', 'balcao', jsonb_build_array(jsonb_build_object('kind', 'product', 'unit_id', u1, 'product_id', p1, 'qty', 6), jsonb_build_object('kind', 'product', 'unit_id', u1, 'product_id', p1, 'qty', 6))); raise exception 'two lines above the stock'; exception when object_not_in_prerequisite_state then null; end;
  begin perform public.create_order(a, 'Cliente', '88999990003', 'balcao', jsonb_build_array(item_r || jsonb_build_object('qty', 2))); raise exception 'more rentals than equipment'; exception when object_not_in_prerequisite_state then null; end;
  begin perform public.create_order(a, 'Cliente', '88999990003', 'balcao', jsonb_build_array(item_l, item_l)); raise exception 'same lesson twice'; exception when invalid_parameter_value then null; end;
  begin perform public.create_order(a, 'Cliente', '88999990003', 'balcao', jsonb_build_array(item_l || jsonb_build_object('qty', 3))); raise exception 'above capacity'; exception when invalid_parameter_value then null; end;
  begin perform public.create_order(a, 'Cliente', '88999990003', 'balcao', jsonb_build_array(item_l || jsonb_build_object('starts_at', pg_temp.at(3, '03:00')))); raise exception 'lesson outside the hours'; exception when invalid_parameter_value then null; end;
  begin perform public.create_order(a, 'Cliente', '88999990003', 'balcao', jsonb_build_array(jsonb_build_object('kind', 'product', 'unit_id', u1, 'product_id', pb, 'qty', 1))); raise exception 'product of another company'; exception when invalid_parameter_value then null; end;
  begin perform public.create_order(a, 'Cliente', '88999990003', 'balcao', '[]'::jsonb); raise exception 'empty order'; exception when invalid_parameter_value then null; end;
  begin perform public.create_order(a, 'C', '88999990003', 'balcao', jsonb_build_array(item_p)); raise exception 'short name'; exception when check_violation then null; end;
  begin perform public.create_order(a, 'Cliente', '88999990003', 'balcao', jsonb_build_array(item_p), 'NAOEXISTE'); raise exception 'unknown coupon'; exception when invalid_parameter_value then assert sqlerrm = 'Coupon not found'; end;
  begin perform public.create_order(a, 'Cliente', '88999990003', 'balcao', jsonb_build_array(item_p), 'PAUSA'); raise exception 'paused coupon'; exception when invalid_parameter_value then assert sqlerrm = 'Coupon is paused'; end;
  begin perform public.create_order(a, 'Cliente', '88999990003', 'balcao', jsonb_build_array(item_p), 'VELHO'); raise exception 'expired coupon'; exception when invalid_parameter_value then assert sqlerrm = 'Coupon expired'; end;
  od3 := public.create_order(a, 'Cliente Três', '88999990003', 'balcao', jsonb_build_array(item_p), 'VENTO10');
  begin perform public.create_order(a, 'Cliente', '88999990003', 'balcao', jsonb_build_array(item_p), 'VENTO10'); raise exception 'coupon above its limit'; exception when invalid_parameter_value then assert sqlerrm = 'Coupon reached its limit'; end;
  perform pg_temp.reset();
  assert (select used from public.company_coupons where code = 'VENTO10') = 2, 'a refused order does not consume the coupon';

  -- 9. Atribuição por cupom do afiliado; afiliado suspenso não recebe venda nova.
  perform pg_temp.act_as(at_); od4 := public.create_order(a, 'Cliente Quatro', '88999990004', 'instagram', jsonb_build_array(item_p), 'AFI5'); perform pg_temp.reset();
  select * into r from public.company_orders where id = od4;
  assert r.affiliate_link_id = alink and (r.discount_cents, r.total_cents, r.affiliate_commission_cents) = (600, 11400, 1140), 'the affiliate coupon attributes the sale';
  perform pg_temp.act_as(mg); perform public.set_affiliate_link_status(alink, 'suspended', 'Divulgação fora das regras'); perform pg_temp.reset();
  perform pg_temp.act_as(at_); od5 := public.create_order(a, 'Cliente Cinco', '88999990005', 'afiliado', jsonb_build_array(item_p), null, 'BRISA-55'); perform pg_temp.reset();
  assert (select affiliate_link_id is null and affiliate_commission_cents = 0 from public.company_orders where id = od5), 'a suspended affiliate earns nothing on new sales';
  assert (select affiliate_commission_cents from public.company_orders where id = od1) = 4140, 'old sales keep their commission';
  assert (select status from public.partners where owner_id = af1::uuid) = 'approved', 'suspending the link does not touch the affiliate on the platform';
  perform pg_temp.act_as(mg); perform public.set_affiliate_link_status(alink, 'active', 'Acordo reestabelecido');

  -- 10. Percentual novo não é retroativo.
  perform public.set_affiliate_rate(a, p1, 2000);
  begin perform public.set_affiliate_rate(a, p1, 2500); raise exception 'second change the same day'; exception when unique_violation then null; end;
  od6 := public.create_order(a, 'Cliente Seis', '88999990006', 'afiliado', jsonb_build_array(item_p, item_r), null, 'BRISA-55');
  perform pg_temp.reset();
  assert (select array_agg(affiliate_bps order by id) from public.company_order_items where order_id = od6) = array[2000, 1000] and (select affiliate_commission_cents from public.company_orders where id = od6) = 3200, 'new rate for the product, default for the rest';
  assert (select affiliate_commission_cents from public.company_orders where id = od1) = 4140 and (select bool_and(affiliate_bps = 1000) from public.company_order_items where order_id = od1), 'the old order was not rewritten';
  begin update public.company_affiliate_rates set bps = 1 where company_id = a; raise exception 'rate edited'; exception when insufficient_privilege then null; end;

  -- 11. Situação, cancelamento, estorno e estado da comissão (nunca "paga").
  select number into n1 from public.company_orders where id = od1; select number into n4 from public.company_orders where id = od4;
  perform pg_temp.act_as(af1); select * into r from public.my_affiliate_sales() where order_number = n1; perform pg_temp.reset();
  assert r.commission_cents = 4140 and r.commission_state = 'expected', 'before delivery it is only expected';
  perform pg_temp.act_as(at_);
  perform public.set_order_status(od1, 'confirmed'); perform public.set_order_status(od1, 'ready');
  begin perform public.set_order_status(od1, 'confirmed'); raise exception 'moved backwards'; exception when object_not_in_prerequisite_state then null; end;
  begin perform public.set_order_status(od1, 'cancelled'); raise exception 'cancelled through status'; exception when invalid_parameter_value then null; end;
  perform public.set_order_status(od1, 'delivered');
  begin perform public.cancel_order(od1, 'Depois de entregue'); raise exception 'cancelled a delivered order'; exception when object_not_in_prerequisite_state then null; end;
  begin perform public.record_order_refund(od1, 1000, 'Atendente estornando'); raise exception 'attendant recorded a refund'; exception when insufficient_privilege then null; end;
  begin perform public.cancel_order(od4, 'x'); raise exception 'cancel without reason'; exception when invalid_parameter_value then null; end;
  perform public.cancel_order(od4, 'Cliente desistiu');
  begin perform public.set_order_status(od4, 'confirmed'); raise exception 'changed a cancelled order'; exception when object_not_in_prerequisite_state then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(mg);
  begin perform public.record_order_refund(od6, 100, 'Pedido não entregue'); raise exception 'refund before delivery'; exception when object_not_in_prerequisite_state then null; end;
  perform public.record_order_refund(od1, 20700, 'Aula não realizada');
  begin perform public.record_order_refund(od1, 20701, 'Acima do total'); raise exception 'refund above the total'; exception when invalid_parameter_value then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(af1);
  select * into r from public.my_affiliate_sales() where order_number = n1;
  assert r.commission_cents = 2070 and r.commission_state = 'due', 'half refunded, half the commission; delivered = due';
  select * into r from public.my_affiliate_sales() where order_number = n4;
  assert r.commission_cents = 0 and r.commission_state = 'cancelled', 'a cancelled sale earns nothing';
  assert (select count(*) from public.my_affiliate_sales()) = 3, 'only the affiliate''s own sales';
  select to_jsonb(x) into k from public.my_affiliate_sales() x limit 1;
  assert not (k ? 'customer_name') and not (k ? 'customer_phone') and k::text !~ 'Cliente|8899999', 'no customer data for the affiliate';
  assert (select count(*) from public.company_orders) = 0 and (select count(*) from public.company_order_items) = 0, 'the affiliate cannot read the orders table';
  perform pg_temp.reset();
  perform pg_temp.act_as(mg); perform public.record_order_refund(od1, 20700, 'Restante devolvido'); perform pg_temp.reset();
  perform pg_temp.act_as(af1); select * into r from public.my_affiliate_sales() where order_number = n1; perform pg_temp.reset();
  assert r.commission_cents = 0 and r.commission_state = 'refunded', 'fully refunded';
  assert not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'company_order_status' and e.enumlabel ilike '%paid%'), 'no paid status';
  assert pg_get_functiondef('public.company_order_commission_state(public.company_order_status,integer,integer)'::regprocedure) !~* 'paid|paga', 'no paid commission state';
  perform pg_temp.act_as(af2); assert (select count(*) from public.my_affiliate_sales()) = 0, 'another affiliate sees nothing'; perform pg_temp.reset();

  -- 12. Congelado e sem escrita direta.
  begin update public.company_orders set total_cents = 1, subtotal_cents = 1, discount_cents = 0 where id = od2; raise exception 'order amounts edited'; exception when insufficient_privilege then null; end;
  begin update public.company_orders set affiliate_commission_cents = 0 where id = od6; raise exception 'commission edited'; exception when insufficient_privilege then null; end;
  begin update public.company_orders set refunded_cents = 0 where id = od1; raise exception 'refund reduced'; exception when insufficient_privilege then null; end;
  begin update public.company_order_items set discount_cents = 0 where order_id = od1; raise exception 'item edited'; exception when insufficient_privilege then null; end;
  begin delete from public.company_orders where id = od2; raise exception 'order deleted'; exception when insufficient_privilege then null; end;
  perform pg_temp.act_as(mg);
  begin insert into public.company_orders (company_id, customer_name, customer_phone, origin, subtotal_cents, total_cents, created_by) values (a, 'Direto', '88999990000', 'balcao', 100, 100, mg::uuid); raise exception 'direct order insert'; exception when insufficient_privilege then null; end;
  begin update public.company_coupons set used = 0; raise exception 'direct coupon update'; exception when insufficient_privilege then null; end;
  begin insert into public.company_affiliate_links (company_id, partner_id, code) values (a, gen_random_uuid(), 'DIRETO'); raise exception 'direct link insert'; exception when insufficient_privilege then null; end;
  begin perform public.company_affiliate_rate_bps(a, null, current_date); raise exception 'internal function callable'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  -- 13. Isolamento.
  perform pg_temp.act_as(o2);
  assert (select count(*) from public.company_orders where company_id = a) = 0 and (select count(*) from public.company_order_items where company_id = a) = 0 and (select count(*) from public.company_coupons where company_id = a) = 0
    and (select count(*) from public.company_affiliate_links where company_id = a) = 0 and (select count(*) from public.company_affiliate_rates where company_id = a) = 0
    and (select count(*) from public.company_campaigns where company_id = a) = 0 and (select count(*) from public.company_store_settings where company_id = a) = 0, 'B sees nothing of A';
  begin perform public.create_order(a, 'Invasor', '88999990009', 'balcao', jsonb_build_array(item_p)); raise exception 'B ordered in A'; exception when insufficient_privilege then null; end;
  begin perform public.cancel_order(od2, 'Invasão de B'); raise exception 'B cancelled an order of A'; exception when insufficient_privilege then null; end;
  begin perform public.create_coupon(b, 'ROUBO', 'percent', 500, 0, 30, 5, null, alink); raise exception 'B tied a coupon to A''s affiliate link'; exception when invalid_parameter_value then null; end;
  perform pg_temp.reset();
  execute 'set role anon';
  begin perform count(*) from public.company_orders; raise exception 'anon read orders'; exception when insufficient_privilege then null; end;
  begin perform public.my_affiliate_sales(); raise exception 'anon called affiliate sales'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  assert not exists (select 1 from public.company_audit_logs where company_id = a and action like 'order.%' and detail::text ~ 'Cliente (Um|Dois|Três|Quatro|Cinco|Seis)|8899999'), 'the audit stores no customer data';
  assert not exists (select 1 from public.company_orders o where o.total_cents <> o.subtotal_cents - o.discount_cents
    or o.discount_cents <> (select sum(i.discount_cents) from public.company_order_items i where i.order_id = o.id)), 'every order reconciles';
end $$;

do $$ declare t text; f text; begin
  foreach t in array array['company_affiliate_links','company_affiliate_requests','company_affiliate_rates','company_affiliate_selections','company_campaigns','company_campaign_items',
      'company_store_settings','company_coupons','company_coupon_units','company_orders','company_order_items'] loop
    assert (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), t || ' has RLS';
    assert not has_table_privilege('authenticated', 'public.' || t, 'INSERT') and not has_table_privilege('authenticated', 'public.' || t, 'UPDATE') and not has_table_privilege('authenticated', 'public.' || t, 'DELETE'), t || ' is read-only for clients';
    assert not has_table_privilege('anon', 'public.' || t, 'SELECT'), t || ' is closed to anon';
  end loop;
  foreach f in array array['company_my_partner_id','company_affiliate_rate_bps','company_is_offer','company_order_can','set_store_settings','create_coupon','set_coupon_active','create_order','set_order_status',
      'cancel_order','record_order_refund','request_company_affiliation','decide_affiliate_request','set_affiliate_link_status','set_affiliate_rate','set_my_affiliate_selection','create_campaign','my_affiliate_sales'] loop
    assert (select bool_and(p.prosecdef and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f), f || ' is definer with a fixed search_path';
  end loop;
end $$;

select 'PASS: business shop and affiliates (catalog prices, exact discount split, per-unit items, frozen commission, no retroactive rate, refunds reflected, never paid, isolation)';
