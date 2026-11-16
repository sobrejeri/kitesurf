-- Business fase 4: caixa por unidade, vendas com valor do banco, fechamento e arquivos privados.
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

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000b2001', 'o1@cx.example', '{"full_name":"Dona A","role":"student"}'),
  ('00000000-0000-0000-0000-0000000b2002', 'o2@cx.example', '{"full_name":"Dono B","role":"student"}'),
  ('00000000-0000-0000-0000-0000000b2003', 'mg@cx.example', '{"full_name":"Gerente","role":"student"}'),
  ('00000000-0000-0000-0000-0000000b2004', 'fi@cx.example', '{"full_name":"Financeiro","role":"student"}'),
  ('00000000-0000-0000-0000-0000000b2005', 'at@cx.example', '{"full_name":"Atendente","role":"student"}'),
  ('00000000-0000-0000-0000-0000000b2006', 'ins@cx.example', '{"full_name":"Instrutor","role":"instructor"}'),
  ('00000000-0000-0000-0000-0000000b2008', 'adm@cx.example', '{"full_name":"Admin","role":"student"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000b2008';
update public.instructors set status = 'approved', approved_at = now() where id = '00000000-0000-0000-0000-0000000b2006';

do $$
declare
  o1 text := '00000000-0000-0000-0000-0000000b2001'; o2 text := '00000000-0000-0000-0000-0000000b2002'; mg text := '00000000-0000-0000-0000-0000000b2003';
  fi text := '00000000-0000-0000-0000-0000000b2004'; at_ text := '00000000-0000-0000-0000-0000000b2005'; ins text := '00000000-0000-0000-0000-0000000b2006'; adm text := '00000000-0000-0000-0000-0000000b2008';
  a uuid; b uuid; u1 uuid; u2 uuid; ub uuid; inv uuid; link uuid; s1 uuid; svc uuid; bk uuid; bk2 uuid; bk_u2 uuid; p1 uuid; e1 uuid; r1 uuid;
  cx uuid; cx2 uuid; cx3 uuid; cxb uuid; diff int; t record; path text; n int;
begin
  -- Preparação: A com duas unidades; gerente nas duas; financeiro e atendente só na 1; instrutor vinculado nas duas.
  perform pg_temp.act_as(o1); a := public.create_company('Escola Caixa A Ltda', 'Escola CA', '11444777000161'); perform pg_temp.reset();
  perform pg_temp.act_as(o2); b := public.create_company('Escola Caixa B Ltda', 'Escola CB', '55443322000105'); perform pg_temp.reset();
  perform pg_temp.act_as(adm); perform public.admin_set_company_status(a, 'active', 'Documentos conferidos'); perform public.admin_set_company_status(b, 'active', 'Documentos conferidos'); perform pg_temp.reset();
  perform pg_temp.act_as(o1);
  u1 := public.create_unit(a, 'Preá Beach', 'Cruz', 'Av. da Praia, 120', null, null, '06:00', '20:00');
  u2 := public.create_unit(a, 'Jeri Centro', 'Jijoca de Jericoacoara', 'Rua Principal, 45', null, null, '06:00', '20:00');
  perform public.invite_staff(a, 'mg@cx.example', jsonb_build_array(jsonb_build_object('unit_id', u1, 'role', 'manager'), jsonb_build_object('unit_id', u2, 'role', 'manager')));
  perform public.invite_staff(a, 'fi@cx.example', jsonb_build_array(jsonb_build_object('unit_id', u1, 'role', 'finance')));
  perform public.invite_staff(a, 'at@cx.example', jsonb_build_array(jsonb_build_object('unit_id', u1, 'role', 'attendant')));
  inv := public.invite_instructor(a, 'ins@cx.example', array[u1, u2], 5500);
  perform pg_temp.reset();
  perform pg_temp.act_as(mg); perform public.accept_company_invitation((select id from public.company_invitations where email = 'mg@cx.example')); perform pg_temp.reset();
  perform pg_temp.act_as(fi); perform public.accept_company_invitation((select id from public.company_invitations where email = 'fi@cx.example')); perform pg_temp.reset();
  perform pg_temp.act_as(at_); perform public.accept_company_invitation((select id from public.company_invitations where email = 'at@cx.example')); perform pg_temp.reset();
  perform pg_temp.act_as(ins); perform public.accept_company_invitation(inv); perform public.save_my_schedule(array[0,1,2,3,4,5,6], '07:00', '18:00', 0); perform pg_temp.reset();
  select id into link from public.company_instructor_links where company_id = a;
  perform pg_temp.act_as(o2); ub := public.create_unit(b, 'Unidade B', 'Camocim', 'Orla da Barra, 8', null, null, '06:00', '20:00'); perform pg_temp.reset();
  -- Serviço, reserva, produto e equipamento (fases 2 e 3) para as vendas com valor do banco.
  perform pg_temp.act_as(o1);
  svc := public.create_service(a, 'Aula iniciante', 120, 2, '', 26000);
  perform public.set_unit_service(svc, u1, 'Praia', array[0,1,2,3,4,5,6]::smallint[], array[link], true);
  perform public.set_unit_service(svc, u2, 'Jeri', array[0,1,2,3,4,5,6]::smallint[], array[link], true);
  p1 := public.create_product(a, 'CAM-VK', 'Camiseta VentoKite', 'Vestuário', 6000, 0);
  perform public.record_stock_movement(u1, p1, 'in', 3, 'Estoque inicial');
  e1 := public.create_equipment(u1, 'PR-01', 'prancha', 'Prancha twin tip 138', 'bom');
  perform public.set_rental_rate(a, 'prancha', 4000);
  bk := public.create_external_booking(u1, svc, ins::uuid, 'Cliente Um', '88999990001', pg_temp.at(3, '08:00'));
  bk2 := public.create_external_booking(u1, svc, ins::uuid, 'Cliente Dois', '88999990002', pg_temp.at(3, '12:00'));
  bk_u2 := public.create_external_booking(u2, svc, ins::uuid, 'Cliente Tres', '88999990003', pg_temp.at(4, '08:00'));
  perform public.cancel_external_booking(bk2, 'Cliente desistiu');
  r1 := public.start_rental(e1, 'Cliente Aluguel', 2);
  perform pg_temp.reset();

  -- 1. Configuração por unidade: só quem fecha caixa altera.
  perform pg_temp.act_as(fi); perform public.set_cash_settings(u1, 'shift', 58, array['closing', 'sale']);
  begin perform public.set_cash_settings(u1, 'shift', 70, array['closing']); raise exception 'paper width 70'; exception when check_violation then null; end;
  begin perform public.set_cash_settings(u1, 'shift', 80, array['nada']); raise exception 'unknown print purpose'; exception when check_violation then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(at_); begin perform public.set_cash_settings(u1, 'manual', 80, array['closing']); raise exception 'attendant changed settings'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(mg); begin perform public.set_cash_settings(u1, 'manual', 80, array['closing']); raise exception 'manager without cash.close changed settings'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  assert (select closing_mode::text || printer_width from public.company_cash_settings where unit_id = u1) = 'shift58', 'settings saved';

  -- 2. Abertura: um caixa aberto por unidade; diário não reabre no mesmo dia.
  perform pg_temp.act_as(at_);
  cx := public.open_cash_session(u1, 20000, 'Rafaela Costa');
  begin perform public.open_cash_session(u1, 0, 'Outra pessoa'); raise exception 'two open sessions'; exception when object_not_in_prerequisite_state then null; end;
  begin perform public.open_cash_session(u2, 0, 'Atendente'); raise exception 'attendant opened in U2'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  begin insert into public.company_cash_sessions (company_id, unit_id, operator_name, opening_cents, opened_by) values (a, u1, 'Direto', 0, o1::uuid); raise exception 'second open by direct insert'; exception when unique_violation then null; end;
  perform pg_temp.act_as(o2); begin perform public.open_cash_session(u1, 0, 'Invasor'); raise exception 'B opened in A'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(mg); cx2 := public.open_cash_session(u2, 1000, 'Diego Furtado'); perform pg_temp.reset();
  perform pg_temp.act_as(o1); perform public.close_cash_session(cx2, 1000, null); perform pg_temp.reset();
  perform pg_temp.act_as(mg); begin perform public.open_cash_session(u2, 0, 'Diego de novo'); raise exception 'daily mode reopened the same day'; exception when object_not_in_prerequisite_state then null; end; perform pg_temp.reset();

  -- 3. Movimentos de dinheiro físico; venda só com origem.
  perform pg_temp.act_as(at_);
  perform public.record_cash_movement(cx, 'supply', 5000, 'Reforço de troco');
  perform public.record_cash_movement(cx, 'expense', 2500, 'Água para os alunos');
  begin perform public.record_cash_movement(cx, 'bleed', 999999, 'Sangria maior que a gaveta'); raise exception 'drawer went negative'; exception when object_not_in_prerequisite_state then null; end;
  perform public.record_cash_movement(cx, 'bleed', 10000, 'Depósito no cofre');
  begin perform public.record_cash_movement(cx, 'sale', 10000, 'Venda livre'); raise exception 'free sale amount'; exception when invalid_parameter_value then null; end;
  begin perform public.record_cash_movement(cx, 'supply', 0, 'Zero'); raise exception 'zero amount'; exception when invalid_parameter_value then null; end;
  begin perform public.record_cash_movement(cx, 'supply', 100, 'ab'); raise exception 'short note'; exception when check_violation then null; end;
  perform pg_temp.reset();
  begin insert into public.company_cash_movements (session_id, company_id, unit_id, kind, method, cents, note, created_by) values (cx, a, u1, 'sale', 'cash', 50000, 'Venda sem origem', o1::uuid); raise exception 'sale without origin'; exception when check_violation then null; end;
  begin insert into public.company_cash_movements (session_id, company_id, unit_id, kind, method, cents, note, created_by) values (cx, a, u1, 'expense', 'pix_external', 100, 'Despesa no Pix', o1::uuid); raise exception 'non-cash expense'; exception when check_violation then null; end;

  -- 4. Venda de produto: valor do banco e saída do estoque na mesma transação.
  perform pg_temp.act_as(at_);
  perform public.sell_product(cx, p1, 2, 'cash');
  perform public.sell_product(cx, p1, 1, 'pix_external');
  begin perform public.sell_product(cx, p1, 1, 'cash'); raise exception 'sold without stock'; exception when check_violation then null; end;
  perform pg_temp.reset();
  assert (select qty from public.company_stock_balances where unit_id = u1 and product_id = p1) = 0, 'stock left the shelf';
  assert (select count(*) from public.company_cash_movements where session_id = cx and stock_movement_id is not null) = 2, 'the refused sale left no cash movement (atomic)';
  assert (select sum(cents) from public.company_cash_movements where session_id = cx and stock_movement_id is not null) = 18000, 'price x quantity from the catalog';
  assert not exists (select 1 from public.company_cash_movements m join public.company_stock_movements sm on sm.id = m.stock_movement_id
    where m.session_id = cx and m.cents <> -sm.qty * 6000), 'each sale matches its stock movement';

  -- 5. Recebimento de reserva e de aluguel: valor congelado, uma vez só, da mesma unidade.
  perform pg_temp.act_as(at_);
  perform public.record_booking_payment(cx, bk, 'card_external');
  begin perform public.record_booking_payment(cx, bk, 'cash'); raise exception 'booking paid twice'; exception when unique_violation then null; end;
  begin perform public.record_booking_payment(cx, bk2, 'cash'); raise exception 'cancelled booking paid'; exception when invalid_parameter_value then null; end;
  begin perform public.record_booking_payment(cx, bk_u2, 'cash'); raise exception 'booking of another unit'; exception when invalid_parameter_value then null; end;
  perform public.record_rental_payment(cx, r1, 'cash');
  begin perform public.record_rental_payment(cx, r1, 'cash'); raise exception 'rental paid twice'; exception when unique_violation then null; end;
  perform pg_temp.reset();
  assert (select cents from public.company_cash_movements where external_booking_id = bk) = 26000 and (select cents from public.company_cash_movements where rental_id = r1) = 8000, 'frozen amounts';

  -- 6. Totais e esperado: só dinheiro conta na gaveta; Pix e cartão só registrados.
  perform pg_temp.act_as(at_); select * into t from public.cash_session_totals(cx); perform pg_temp.reset();
  assert (t.sales_cash_cents, t.sales_pix_cents, t.sales_card_cents, t.supplies_cents, t.bleeds_cents, t.expenses_cents, t.expected_cents) = (20000, 6000, 26000, 5000, 10000, 2500, 32500),
    'expected = 20000 opening + 20000 cash sales + 5000 supply - 10000 bleed - 2500 expense';
  perform pg_temp.act_as(o2); begin perform public.cash_session_totals(cx); raise exception 'B read totals of A'; exception when insufficient_privilege then null; end; perform pg_temp.reset();

  -- 7. Fechamento: só quem tem cash.close; diferença exige motivo; nada entra depois.
  perform pg_temp.act_as(at_); begin perform public.close_cash_session(cx, 32500, null); raise exception 'attendant closed'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(mg); begin perform public.close_cash_session(cx, 32500, null); raise exception 'manager without cash.close closed'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(fi);
  begin perform public.close_cash_session(cx, 31500, 'curto'); raise exception 'difference with a short reason'; exception when invalid_parameter_value then null; end;
  diff := public.close_cash_session(cx, 31500, 'Troco entregue sem registro');
  perform pg_temp.reset();
  assert diff = -1000, 'shortage of 10,00';
  select * into t from public.company_cash_sessions where id = cx;
  assert t.status = 'closed' and t.expected_cents = 32500 and t.counted_cents = 31500 and t.difference_cents = -1000 and t.closing_reason = 'Troco entregue sem registro', 'closing stored';
  perform pg_temp.act_as(at_);
  begin perform public.record_cash_movement(cx, 'supply', 100, 'Depois de fechado'); raise exception 'movement after closing'; exception when object_not_in_prerequisite_state then null; end;
  begin perform public.sell_product(cx, p1, 1, 'cash'); raise exception 'sale after closing'; exception when object_not_in_prerequisite_state then null; end;
  perform pg_temp.reset();
  begin insert into public.company_cash_movements (session_id, company_id, unit_id, kind, method, cents, note, created_by) values (cx, a, u1, 'supply', 'cash', 100, 'Direto depois de fechado', o1::uuid); raise exception 'direct insert after closing'; exception when object_not_in_prerequisite_state then null; end;
  begin update public.company_cash_sessions set counted_cents = 32500, difference_cents = 0 where id = cx; raise exception 'closed session edited'; exception when insufficient_privilege then null; end;
  begin update public.company_cash_movements set cents = 1 where session_id = cx; raise exception 'movement edited'; exception when insufficient_privilege then null; end;
  begin delete from public.company_cash_movements where session_id = cx; raise exception 'movement deleted'; exception when insufficient_privilege then null; end;
  begin delete from public.company_cash_sessions where id = cx; raise exception 'session deleted'; exception when insufficient_privilege then null; end;
  perform pg_temp.act_as(at_); cx3 := public.open_cash_session(u1, 0, 'Turno da tarde'); perform pg_temp.reset(); -- shift mode: reopens the same day
  perform pg_temp.act_as(fi); diff := public.close_cash_session(cx3, 0, null); perform pg_temp.reset();
  assert diff = 0, 'no difference needs no reason';

  -- 8. Arquivos do fechamento em Storage privado.
  path := a::text || '/' || cx::text || '/fechamento.pdf';
  perform pg_temp.act_as(fi);
  assert public.company_closing_object_access(path, true), 'finance may upload the closing file';
  assert public.company_closing_object_access(path, false), 'finance may read it';
  assert not public.company_closing_object_access(a::text || '/' || cx::text || '/outro.pdf', true) and not public.company_closing_object_access('x/y/fechamento.pdf', true)
    and not public.company_closing_object_access(b::text || '/' || cx::text || '/fechamento.pdf', false), 'only the exact path of the right company';
  begin perform public.register_closing_file(cx, 'pdf', repeat('a', 64), 1000); raise exception 'registered without upload'; exception when no_data_found then null; end;
  perform pg_temp.reset();
  insert into storage.objects (bucket_id, name) values ('vento-business-closings', path);
  perform pg_temp.act_as(fi);
  perform public.register_closing_file(cx, 'pdf', repeat('a', 64), 1000);
  assert not public.company_closing_object_access(path, true), 'no second upload of the same file';
  begin perform public.register_closing_file(cx, 'pdf', repeat('b', 64), 1000); raise exception 'registered twice'; exception when unique_violation then null; end;
  begin perform public.register_closing_file(cx, 'csv', repeat('b', 64), 1000); raise exception 'bad kind'; exception when invalid_parameter_value then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(at_); cxb := public.open_cash_session(u1, 0, 'Turno da noite'); perform pg_temp.reset();
  perform pg_temp.act_as(fi);
  assert not public.company_closing_object_access(a::text || '/' || cxb::text || '/fechamento.xlsx', true), 'no upload while the session is open';
  begin perform public.register_closing_file(cxb, 'xlsx', repeat('c', 64), 1000); raise exception 'registered on an open session'; exception when object_not_in_prerequisite_state then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(mg); assert public.company_closing_object_access(path, false) and not public.company_closing_object_access(path, true), 'manager reads (finance.reports), does not write'; perform pg_temp.reset();
  perform pg_temp.act_as(at_); assert not public.company_closing_object_access(path, false), 'attendant does not read closing files'; perform pg_temp.reset();
  perform pg_temp.act_as(o2); assert not public.company_closing_object_access(path, false), 'B does not read A''s files'; perform pg_temp.reset();
  begin update public.company_cash_closing_files set bytes = 2 where session_id = cx; raise exception 'file record edited'; exception when insufficient_privilege then null; end;

  -- 9. Isolamento e leitura por unidade.
  perform pg_temp.act_as(o2);
  assert (select count(*) from public.company_cash_sessions where company_id = a) = 0 and (select count(*) from public.company_cash_movements where company_id = a) = 0
    and (select count(*) from public.company_cash_closing_files where company_id = a) = 0 and (select count(*) from public.company_cash_settings where company_id = a) = 0, 'B sees nothing of A';
  begin perform public.record_cash_movement(cxb, 'supply', 100, 'Invasão'); raise exception 'B wrote in A''s cash'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(at_); assert (select count(*) from public.company_cash_sessions where unit_id = u2) = 0 and (select count(*) from public.company_cash_sessions where unit_id = u1) = 3, 'the attendant sees only U1'; perform pg_temp.reset();
  perform pg_temp.act_as(at_); begin perform count(*) from public.company_cash_closing_files; assert (select count(*) from public.company_cash_closing_files) = 0, 'attendant sees no file records'; end; perform pg_temp.reset();

  -- 10. Cliente nunca escreve direto; anon fechado; auditoria.
  perform pg_temp.act_as(fi);
  begin insert into public.company_cash_movements (session_id, company_id, unit_id, kind, method, cents, note, created_by) values (cxb, a, u1, 'supply', 'cash', 100, 'Direto', fi::uuid); raise exception 'client inserted a movement'; exception when insufficient_privilege then null; end;
  begin update public.company_cash_sessions set status = 'closed' where id = cxb; raise exception 'client closed directly'; exception when insufficient_privilege then null; end;
  begin perform public.company_cash_expected(cxb); raise exception 'internal function callable'; exception when insufficient_privilege then null; end;
  begin perform public.company_cash_lock(cxb, 'cash.operate'); raise exception 'internal function callable'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  execute 'set role anon';
  begin perform count(*) from public.company_cash_sessions; raise exception 'anon read cash'; exception when insufficient_privilege then null; end;
  begin perform public.open_cash_session(u1, 0, 'Anon'); raise exception 'anon opened cash'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  select count(*) into n from public.company_audit_logs where company_id = a and action like 'cash.%';
  assert n >= 12, 'cash actions are audited';
  assert not exists (select 1 from public.company_cash_sessions s where s.status = 'closed' and s.expected_cents <> public.company_cash_expected(s.id)), 'every stored expected equals the movements';
end $$;

do $$ declare t text; f text; begin
  foreach t in array array['company_cash_settings','company_cash_sessions','company_cash_movements','company_cash_closing_files'] loop
    assert (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), t || ' has RLS';
    assert not has_table_privilege('authenticated', 'public.' || t, 'INSERT') and not has_table_privilege('authenticated', 'public.' || t, 'UPDATE') and not has_table_privilege('authenticated', 'public.' || t, 'DELETE'), t || ' is read-only for clients';
    assert not has_table_privilege('anon', 'public.' || t, 'SELECT'), t || ' is closed to anon';
  end loop;
  foreach f in array array['company_cash_movement_guard','company_cash_expected','company_cash_lock','company_closing_object_access','set_cash_settings','open_cash_session','record_cash_movement',
      'sell_product','record_booking_payment','record_rental_payment','close_cash_session','register_closing_file','cash_session_totals'] loop
    assert (select bool_and(p.prosecdef and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f), f || ' is definer with a fixed search_path';
  end loop;
  assert (select not public from storage.buckets where id = 'vento-business-closings'), 'the closings bucket is private';
  assert not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'vento_business_closings%' and ('anon' = any (roles) or 'public' = any (roles))), 'no anon policy';
  assert not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'vento_business_closings%' and cmd in ('UPDATE', 'DELETE')), 'no update or delete policy: files are immutable';
end $$;

select 'PASS: business cash (one open per unit, values from the database, cash-only drawer, closing with reason, nothing after closing, private immutable files, isolation)';
