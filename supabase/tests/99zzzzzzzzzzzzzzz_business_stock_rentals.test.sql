-- Business fase 3: estoque (razão), equipamentos, aluguéis e manutenção.
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

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000a1001', 'o1@stk.example', '{"full_name":"Dona A","role":"student"}'),
  ('00000000-0000-0000-0000-0000000a1002', 'o2@stk.example', '{"full_name":"Dono B","role":"student"}'),
  ('00000000-0000-0000-0000-0000000a1003', 'mg@stk.example', '{"full_name":"Gerente","role":"student"}'),
  ('00000000-0000-0000-0000-0000000a1004', 'fi@stk.example', '{"full_name":"Financeiro","role":"student"}'),
  ('00000000-0000-0000-0000-0000000a1005', 'at@stk.example', '{"full_name":"Atendente","role":"student"}'),
  ('00000000-0000-0000-0000-0000000a1008', 'adm@stk.example', '{"full_name":"Admin","role":"student"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000a1008';

do $$
declare
  o1 text := '00000000-0000-0000-0000-0000000a1001'; o2 text := '00000000-0000-0000-0000-0000000a1002'; mg text := '00000000-0000-0000-0000-0000000a1003';
  fi text := '00000000-0000-0000-0000-0000000a1004'; at_ text := '00000000-0000-0000-0000-0000000a1005'; adm text := '00000000-0000-0000-0000-0000000a1008';
  a uuid; b uuid; u1 uuid; u2 uuid; ub uuid; inv uuid; p1 uuid; p2 uuid; pb uuid; e1 uuid; e2 uuid; e3 uuid; eb uuid; r1 uuid; r2 uuid; t1 uuid; tid uuid; n int; tot_before int; tot_after int; k record;
begin
  -- Preparação: duas empresas ativas; A com duas unidades; gerente nas duas, atendente só na 1, financeiro na 1.
  perform pg_temp.act_as(o1); a := public.create_company('Escola Estoque A Ltda', 'Escola EA', '12345678000195'); perform pg_temp.reset();
  perform pg_temp.act_as(o2); b := public.create_company('Escola Estoque B Ltda', 'Escola EB', '87654321000198'); perform pg_temp.reset();
  perform pg_temp.act_as(adm); perform public.admin_set_company_status(a, 'active', 'Documentos conferidos'); perform public.admin_set_company_status(b, 'active', 'Documentos conferidos'); perform pg_temp.reset();
  perform pg_temp.act_as(o1);
  u1 := public.create_unit(a, 'Preá Beach', 'Cruz', 'Av. da Praia, 120', null, null, '06:00', '20:00');
  u2 := public.create_unit(a, 'Jeri Centro', 'Jijoca de Jericoacoara', 'Rua Principal, 45', null, null, '06:00', '20:00');
  perform public.invite_staff(a, 'mg@stk.example', jsonb_build_array(jsonb_build_object('unit_id', u1, 'role', 'manager'), jsonb_build_object('unit_id', u2, 'role', 'manager')));
  perform public.invite_staff(a, 'fi@stk.example', jsonb_build_array(jsonb_build_object('unit_id', u1, 'role', 'finance')));
  perform public.invite_staff(a, 'at@stk.example', jsonb_build_array(jsonb_build_object('unit_id', u1, 'role', 'attendant')));
  perform pg_temp.reset();
  perform pg_temp.act_as(mg); perform public.accept_company_invitation((select id from public.company_invitations where email = 'mg@stk.example')); perform pg_temp.reset();
  perform pg_temp.act_as(fi); perform public.accept_company_invitation((select id from public.company_invitations where email = 'fi@stk.example')); perform pg_temp.reset();
  perform pg_temp.act_as(at_); perform public.accept_company_invitation((select id from public.company_invitations where email = 'at@stk.example')); perform pg_temp.reset();
  perform pg_temp.act_as(o2); ub := public.create_unit(b, 'Unidade B', 'Camocim', 'Orla da Barra, 8', null, null, '06:00', '20:00'); perform pg_temp.reset();

  -- 1. Produtos: só quem ajusta estoque cria; código normalizado e único por empresa.
  perform pg_temp.act_as(mg);
  p1 := public.create_product(a, 'cam-vk', 'Camiseta VentoKite', 'Vestuário', 6000, 5);
  p2 := public.create_product(a, 'PRO-50', 'Protetor solar FPS 50', 'Cuidados', 3500, 6);
  assert (select sku from public.company_products where id = p1) = 'CAM-VK', 'sku in upper case';
  begin perform public.create_product(a, 'CAM-VK', 'Outra camiseta', '', 6000, 5); raise exception 'duplicate sku'; exception when unique_violation then null; end;
  begin perform public.create_product(a, 'BAD', 'Produto barato', '', 50, 5); raise exception 'price below minimum'; exception when check_violation then null; end;
  begin perform public.create_product(a, 'x y', 'Código ruim', '', 5000, 5); raise exception 'bad sku'; exception when check_violation then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(at_); begin perform public.create_product(a, 'ATD-01', 'Produto do atendente', '', 5000, 1); raise exception 'attendant created a product'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(o2); pb := public.create_product(b, 'CAM-VK', 'Camiseta da escola B', '', 5000, 1); begin perform public.create_product(a, 'INV-01', 'Invasão', '', 5000, 1); raise exception 'other company created a product'; exception when insufficient_privilege then null; end; perform pg_temp.reset();

  -- 2. Razão e saldo: entrada, venda, ajuste. Nunca negativo; saldo = soma do razão.
  perform pg_temp.act_as(at_);
  perform public.record_stock_movement(u1, p1, 'in', 20, 'Compra do fornecedor');
  perform public.record_stock_movement(u1, p1, 'sale', 5, 'Venda no balcão');
  begin perform public.record_stock_movement(u1, p1, 'sale', 16, 'Venda grande demais'); raise exception 'oversold'; exception when check_violation then null; end;
  begin perform public.record_stock_movement(u1, p1, 'adjust', -1, 'Contagem'); raise exception 'attendant adjusted'; exception when insufficient_privilege then null; end;
  begin perform public.record_stock_movement(u1, p1, 'sale', -3, 'Quantidade negativa'); raise exception 'negative sale quantity'; exception when invalid_parameter_value then null; end;
  begin perform public.record_stock_movement(u1, p1, 'in', 5, 'ab'); raise exception 'short note'; exception when check_violation then null; end;
  begin perform public.record_stock_movement(u1, p1, 'refund', 5, 'Tipo inválido'); raise exception 'bad type'; exception when invalid_parameter_value then null; end;
  begin perform public.record_stock_movement(u2, p1, 'in', 5, 'Unidade onde não trabalha'); raise exception 'attendant of U1 wrote in U2'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  assert (select qty from public.company_stock_balances where unit_id = u1 and product_id = p1) = 15, 'balance after in 20 and sale 5; the refused sale changed nothing';
  perform pg_temp.act_as(mg);
  perform public.record_stock_movement(u1, p1, 'adjust', -3, 'Contagem do inventário'); perform public.record_stock_movement(u1, p1, 'adjust', 1, 'Achado na prateleira');
  begin perform public.record_stock_movement(u1, p1, 'adjust', -100, 'Ajuste impossível'); raise exception 'adjust below zero'; exception when check_violation then null; end;
  perform pg_temp.reset();
  assert (select qty from public.company_stock_balances where unit_id = u1 and product_id = p1) = 13, 'adjustments applied';
  assert (select coalesce(sum(qty), 0) from public.company_stock_movements where unit_id = u1 and product_id = p1) = 13, 'the balance equals the sum of the ledger';
  begin insert into public.company_stock_movements (company_id, unit_id, product_id, type, qty, note, created_by) values (a, u1, p1, 'sale', -50, 'Direto', o1::uuid); raise exception 'ledger insert drove the stock negative'; exception when check_violation then null; end;
  begin insert into public.company_stock_movements (company_id, unit_id, product_id, type, qty, note, created_by) values (a, u1, p1, 'sale', 5, 'Sinal errado', o1::uuid); raise exception 'sale with a positive quantity'; exception when check_violation then null; end;
  begin update public.company_stock_movements set qty = 999 where unit_id = u1; raise exception 'ledger edited'; exception when insufficient_privilege then null; end;
  begin delete from public.company_stock_movements where unit_id = u1; raise exception 'ledger deleted'; exception when insufficient_privilege then null; end;

  -- 3. Transferência: duas linhas, mesmo id, total conservado, atômica.
  perform pg_temp.act_as(mg);
  select coalesce(sum(qty), 0) into tot_before from public.company_stock_balances where product_id = p1;
  tid := public.transfer_stock(p1, u1, u2, 7);
  select coalesce(sum(qty), 0) into tot_after from public.company_stock_balances where product_id = p1;
  assert tot_before = tot_after and tot_after = 13, 'the total across units did not change';
  assert (select qty from public.company_stock_balances where unit_id = u1 and product_id = p1) = 6 and (select qty from public.company_stock_balances where unit_id = u2 and product_id = p1) = 7, 'origin and destination';
  assert (select count(*) from public.company_stock_movements where transfer_id = tid) = 2 and (select sum(qty) from public.company_stock_movements where transfer_id = tid) = 0, 'two movements that cancel out';
  begin perform public.transfer_stock(p1, u1, u2, 7); raise exception 'transferred more than the origin has'; exception when check_violation then null; end;
  assert (select qty from public.company_stock_balances where unit_id = u2 and product_id = p1) = 7, 'a refused transfer moved nothing (atomic)';
  begin perform public.transfer_stock(p1, u1, u1, 1); raise exception 'same unit'; exception when invalid_parameter_value then null; end;
  begin perform public.transfer_stock(p1, u1, ub, 1); raise exception 'unit of another company'; exception when invalid_parameter_value then null; end;
  begin perform public.transfer_stock(pb, u1, u2, 1); raise exception 'product of another company'; exception when invalid_parameter_value then null; end;
  begin perform public.transfer_stock(p1, u1, u2, 0); raise exception 'zero quantity'; exception when invalid_parameter_value then null; end;
  perform public.transfer_stock(p1, u2, u1, 2); -- opposite direction (lock order)
  perform pg_temp.reset();
  perform pg_temp.act_as(at_); begin perform public.transfer_stock(p1, u1, u2, 1); raise exception 'attendant with access to only one of the units'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  assert (select qty from public.company_stock_balances where unit_id = u1 and product_id = p1) = 8 and (select qty from public.company_stock_balances where unit_id = u2 and product_id = p1) = 5, 'opposite transfer applied';

  -- 4. Equipamentos e tarifa.
  perform pg_temp.act_as(mg);
  e1 := public.create_equipment(u1, 'pr-01', 'prancha', 'Prancha twin tip 138', 'bom');
  e2 := public.create_equipment(u1, 'PI-01', 'pipa', 'Pipa 9 m', 'novo');
  e3 := public.create_equipment(u2, 'TR-01', 'trapezio', 'Trapézio M', 'bom');
  assert (select code from public.company_equipment where id = e1) = 'PR-01', 'code in upper case';
  begin perform public.create_equipment(u1, 'PR-01', 'prancha', 'Duplicada', 'bom'); raise exception 'duplicate code'; exception when unique_violation then null; end;
  begin perform public.create_equipment(u1, 'PRANCHA1', 'prancha', 'Código ruim', 'bom'); raise exception 'bad code'; exception when check_violation then null; end;
  perform public.set_rental_rate(a, 'prancha', 4000); perform public.set_rental_rate(a, 'pipa', 8000);
  begin perform public.set_rental_rate(a, 'prancha', 4500); raise exception 'second rate change the same day'; exception when unique_violation then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(at_); begin perform public.create_equipment(u1, 'CO-01', 'colete', 'Colete G', 'bom'); raise exception 'attendant created equipment'; exception when insufficient_privilege then null; end;
  begin perform public.set_rental_rate(a, 'colete', 1500); raise exception 'attendant set a rate'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  assert public.company_equipment_status(e1) = 'available', 'new equipment is available';

  -- 5. Aluguel: preço congelado do banco, um ativo por equipamento, só se disponível.
  perform pg_temp.act_as(at_);
  r1 := public.start_rental(e1, 'Cliente Um', 3);
  perform pg_temp.reset();
  select * into k from public.company_rentals where id = r1;
  assert k.price_cents = 12000 and k.hours = 3 and k.condition_out = 'bom' and k.returned_at is null, 'price = rate x hours, frozen at start';
  assert public.company_equipment_status(e1) = 'rented', 'derived status: rented';
  perform pg_temp.act_as(at_);
  begin perform public.start_rental(e1, 'Cliente Dois', 1); raise exception 'rented twice'; exception when object_not_in_prerequisite_state then null; end;
  begin perform public.open_maintenance(e1, 'Quer abrir manutenção alugado'); raise exception 'maintenance on a rented item'; exception when object_not_in_prerequisite_state then null; end;
  begin perform public.start_rental(e2, 'Cliente', 9); raise exception '9 hours'; exception when invalid_parameter_value then null; end;
  begin perform public.start_rental(e2, 'C', 2); raise exception 'short customer name'; exception when check_violation then null; end;
  begin perform public.start_rental(e3, 'Cliente', 2); raise exception 'attendant rented in a unit where there is no access'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(mg); begin perform public.start_rental(e3, 'Cliente', 2); raise exception 'no rate for the type'; exception when no_data_found then null; end; perform pg_temp.reset();
  begin insert into public.company_rentals (company_id, unit_id, equipment_id, customer_name, hours, price_cents, condition_out, created_by) values (a, u1, e1, 'Direto', 1, 1, 'bom', o1::uuid); raise exception 'second active rental by direct insert'; exception when unique_violation then null; end;
  begin update public.company_rentals set price_cents = 1 where id = r1; raise exception 'rental price edited'; exception when insufficient_privilege then null; end;
  begin delete from public.company_rentals where id = r1; raise exception 'rental deleted'; exception when insufficient_privilege then null; end;
  perform pg_temp.act_as(mg); perform public.set_rental_rate(a, 'colete', 1500); perform pg_temp.reset();

  -- 6. Devolução: igual volta a disponível; pior exige descrição; "ruim" abre manutenção.
  perform pg_temp.act_as(at_);
  begin perform public.return_rental(r1, 'regular', ''); raise exception 'worse without a note'; exception when invalid_parameter_value then null; end;
  perform public.return_rental(r1, 'bom', null);
  begin perform public.return_rental(r1, 'bom', null); raise exception 'returned twice'; exception when object_not_in_prerequisite_state then null; end;
  perform pg_temp.reset();
  assert public.company_equipment_status(e1) = 'available', 'back to available';
  assert (select price_cents from public.company_rentals where id = r1) = 12000, 'the price is unchanged after the return';
  begin update public.company_rentals set return_note = 'alterado depois' where id = r1; raise exception 'returned rental changed'; exception when insufficient_privilege then null; end;
  perform pg_temp.act_as(mg); perform public.set_rental_rate(a, 'capacete', 1000); perform pg_temp.reset();
  perform pg_temp.act_as(at_);
  r2 := public.start_rental(e1, 'Cliente Três', 2);
  perform pg_temp.reset();
  assert (select price_cents from public.company_rentals where id = r2) = 8000 and (select price_cents from public.company_rentals where id = r1) = 12000, 'both rentals priced at the rate of their time';
  perform pg_temp.act_as(at_); perform public.return_rental(r2, 'ruim', 'Quilha quebrada na água'); perform pg_temp.reset();
  assert public.company_equipment_status(e1) = 'maintenance', 'a bad return opens maintenance';
  assert (select condition from public.company_equipment where id = e1) = 'ruim' and exists (select 1 from public.company_maintenance where equipment_id = e1 and status = 'open' and description like '%Quilha quebrada%'), 'condition updated, ticket opened';
  perform pg_temp.act_as(at_);
  begin perform public.start_rental(e1, 'Cliente Quatro', 1); raise exception 'rented while in maintenance'; exception when object_not_in_prerequisite_state then null; end;
  begin perform public.open_maintenance(e1, 'Outro chamado para o mesmo'); raise exception 'second open ticket'; exception when object_not_in_prerequisite_state then null; end;
  perform pg_temp.reset();

  -- 7. Manutenção e aposentadoria.
  perform pg_temp.act_as(at_);
  perform public.close_maintenance((select id from public.company_maintenance where equipment_id = e1 and status = 'open'), 12000, 'bom');
  begin perform public.close_maintenance((select id from public.company_maintenance where equipment_id = e1 limit 1), 0, 'bom'); raise exception 'closed twice'; exception when object_not_in_prerequisite_state then null; end;
  perform pg_temp.reset();
  assert public.company_equipment_status(e1) = 'available' and (select condition from public.company_equipment where id = e1) = 'bom', 'repaired and rentable again';
  perform pg_temp.act_as(at_); t1 := public.open_maintenance(e2, 'Revisão das linhas'); perform pg_temp.reset();
  assert public.company_equipment_status(e2) = 'maintenance', 'manual maintenance';
  perform pg_temp.act_as(at_); begin perform public.retire_equipment(e2, 'Fim da vida útil'); raise exception 'attendant retired equipment'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(mg);
  begin perform public.retire_equipment(e2, 'x'); raise exception 'retire without reason'; exception when invalid_parameter_value then null; end;
  perform public.retire_equipment(e2, 'Fim da vida útil');
  begin perform public.retire_equipment(e2, 'Aposentar de novo'); raise exception 'retired twice'; exception when object_not_in_prerequisite_state then null; end;
  perform pg_temp.reset();
  assert public.company_equipment_status(e2) = 'retired', 'retired wins over maintenance';
  perform pg_temp.act_as(at_); perform public.close_maintenance(t1, 0, 'regular'); begin perform public.start_rental(e2, 'Cliente', 1); raise exception 'rented a retired item'; exception when object_not_in_prerequisite_state then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(at_); r1 := public.start_rental(e1, 'Cliente Cinco', 1); perform pg_temp.reset();
  perform pg_temp.act_as(mg); begin perform public.retire_equipment(e1, 'Tentando aposentar alugado'); raise exception 'retired a rented item'; exception when object_not_in_prerequisite_state then null; end; perform pg_temp.reset();

  -- 8. Isolamento e escopo por unidade.
  perform pg_temp.act_as(o2);
  assert (select count(*) from public.company_products where company_id = a) = 0 and (select count(*) from public.company_stock_balances where unit_id in (u1, u2)) = 0
    and (select count(*) from public.company_stock_movements where company_id = a) = 0 and (select count(*) from public.company_equipment where company_id = a) = 0
    and (select count(*) from public.company_rentals where company_id = a) = 0 and (select count(*) from public.company_rental_rates where company_id = a) = 0
    and (select count(*) from public.company_maintenance where company_id = a) = 0, 'B sees nothing of A';
  begin perform public.record_stock_movement(u1, p1, 'in', 5, 'Invasão de B'); raise exception 'B wrote stock in A'; exception when insufficient_privilege then null; end;
  begin perform public.start_rental(e1, 'Invasor', 1); raise exception 'B rented equipment of A'; exception when insufficient_privilege then null; end;
  begin perform public.return_rental(r1, 'bom', null); raise exception 'B returned a rental of A'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(at_);
  assert (select count(*) from public.company_equipment where unit_id = u2) = 0 and (select count(*) from public.company_stock_balances where unit_id = u2) = 0 and (select count(*) from public.company_equipment where unit_id = u1) = 2, 'the attendant of U1 sees only U1';
  perform pg_temp.reset();
  perform pg_temp.act_as(fi);
  assert (select count(*) from public.company_stock_balances where unit_id = u1) >= 1, 'finance can read stock'; begin perform public.record_stock_movement(u1, p1, 'in', 1, 'Financeiro mexendo'); raise exception 'finance wrote stock'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  -- 9. Cliente nunca escreve direto; anon fechado; invariantes globais.
  perform pg_temp.act_as(o1);
  begin insert into public.company_products (company_id, sku, name, price_cents) values (a, 'DIR-01', 'Direto', 500); raise exception 'direct product insert'; exception when insufficient_privilege then null; end;
  begin update public.company_stock_balances set qty = 999; raise exception 'direct balance update'; exception when insufficient_privilege then null; end;
  begin update public.company_equipment set retired = true where id = e1; raise exception 'direct equipment update'; exception when insufficient_privilege then null; end;
  begin perform public.company_equipment_status(e1); raise exception 'internal function callable'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  execute 'set role anon';
  begin perform count(*) from public.company_stock_balances; raise exception 'anon read stock'; exception when insufficient_privilege then null; end;
  begin perform public.start_rental(e1, 'Cliente Anon', 1); raise exception 'anon rented'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  assert not exists (select 1 from (select b2.unit_id, b2.product_id, b2.qty, coalesce((select sum(m.qty) from public.company_stock_movements m where m.unit_id = b2.unit_id and m.product_id = b2.product_id), 0) as s from public.company_stock_balances b2) x where x.qty <> x.s), 'every balance equals the sum of its ledger';
  assert not exists (select 1 from public.company_stock_balances where qty < 0), 'no negative stock anywhere';
  assert (select count(*) from public.company_audit_logs where company_id = a and action in ('stock.in', 'stock.sale', 'stock.adjust', 'stock.transfer', 'rental.started', 'rental.returned', 'maintenance.opened', 'maintenance.closed', 'equipment.retired', 'product.created', 'equipment.created', 'rental.rate')) >= 20, 'stock, rental and maintenance actions are audited';
  assert not exists (select 1 from public.company_audit_logs where company_id = a and action like 'rental.%' and detail::text ~ 'Cliente'), 'the audit does not store customer names';
end $$;

-- Catálogo: RLS, sem escrita direta, search_path fixo.
do $$ declare t text; f text; begin
  foreach t in array array['company_products','company_stock_balances','company_stock_movements','company_equipment','company_rental_rates','company_rentals','company_maintenance'] loop
    assert (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), t || ' has RLS';
    assert not has_table_privilege('authenticated', 'public.' || t, 'INSERT') and not has_table_privilege('authenticated', 'public.' || t, 'UPDATE') and not has_table_privilege('authenticated', 'public.' || t, 'DELETE'), t || ' is read-only for clients';
    assert not has_table_privilege('anon', 'public.' || t, 'SELECT'), t || ' is closed to anon';
  end loop;
  foreach f in array array['company_stock_apply','company_equipment_status','create_product','record_stock_movement','transfer_stock','create_equipment','set_rental_rate','start_rental','return_rental','open_maintenance','close_maintenance','retire_equipment'] loop
    assert (select bool_and(p.prosecdef and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f), f || ' is definer with a fixed search_path';
  end loop;
  assert not has_function_privilege('authenticated', 'public.company_equipment_status(uuid)', 'EXECUTE') and not has_function_privilege('anon', 'public.start_rental(uuid,text,integer)', 'EXECUTE'), 'internal and anon execution';
end $$;

select 'PASS: business stock and rentals (ledger, never negative, transfers conserve the total, derived equipment status, frozen rental price, maintenance, isolation)';
