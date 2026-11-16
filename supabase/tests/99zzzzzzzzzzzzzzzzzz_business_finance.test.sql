-- Business fase 6: lançamentos, contas a receber e a pagar, pagamentos externos aos instrutores e resumo.
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
  ('00000000-0000-0000-0000-0000000d6001', 'o1@fin.example', '{"full_name":"Dona A","role":"student"}'),
  ('00000000-0000-0000-0000-0000000d6002', 'o2@fin.example', '{"full_name":"Dono B","role":"student"}'),
  ('00000000-0000-0000-0000-0000000d6003', 'mg@fin.example', '{"full_name":"Gerente","role":"student"}'),
  ('00000000-0000-0000-0000-0000000d6004', 'fi@fin.example', '{"full_name":"Financeiro","role":"student"}'),
  ('00000000-0000-0000-0000-0000000d6005', 'at@fin.example', '{"full_name":"Atendente","role":"student"}'),
  ('00000000-0000-0000-0000-0000000d6006', 'ins@fin.example', '{"full_name":"Instrutor","role":"instructor"}'),
  ('00000000-0000-0000-0000-0000000d6007', 'ins2@fin.example', '{"full_name":"Outro Instrutor","role":"instructor"}'),
  ('00000000-0000-0000-0000-0000000d6008', 'adm@fin.example', '{"full_name":"Admin","role":"student"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000d6008';
update public.instructors set status = 'approved', approved_at = now() where id in ('00000000-0000-0000-0000-0000000d6006', '00000000-0000-0000-0000-0000000d6007');

do $$
declare
  o1 text := '00000000-0000-0000-0000-0000000d6001'; o2 text := '00000000-0000-0000-0000-0000000d6002'; mg text := '00000000-0000-0000-0000-0000000d6003';
  fi text := '00000000-0000-0000-0000-0000000d6004'; at_ text := '00000000-0000-0000-0000-0000000d6005'; ins text := '00000000-0000-0000-0000-0000000d6006';
  ins2 text := '00000000-0000-0000-0000-0000000d6007'; adm text := '00000000-0000-0000-0000-0000000d6008';
  a uuid; b uuid; u1 uuid; u2 uuid; inv uuid; link uuid; svc uuid; p1 uuid; bk1 uuid; bk2 uuid; cx uuid;
  e_rev bigint; e_exp bigint; e_back bigint; d1 uuid; d2 uuid; d3 uuid; pay1 uuid; pay2 uuid; pay3 uuid; r record; n int; today date := (now() at time zone 'America/Fortaleza')::date;
begin
  -- Preparação: empresa A (gerente nas duas unidades; financeiro e atendente só na 1), instrutor vinculado, duas reservas.
  perform pg_temp.act_as(o1); a := public.create_company('Escola Financas A Ltda', 'Escola FA', '44556677000186'); perform pg_temp.reset();
  perform pg_temp.act_as(o2); b := public.create_company('Escola Financas B Ltda', 'Escola FB', '55667788000186'); perform pg_temp.reset();
  perform pg_temp.act_as(adm); perform public.admin_set_company_status(a, 'active', 'Documentos conferidos'); perform public.admin_set_company_status(b, 'active', 'Documentos conferidos'); perform pg_temp.reset();
  perform pg_temp.act_as(o1);
  u1 := public.create_unit(a, 'Preá Beach', 'Cruz', 'Av. da Praia, 120', null, null, '06:00', '20:00');
  u2 := public.create_unit(a, 'Jeri Centro', 'Jijoca de Jericoacoara', 'Rua Principal, 45', null, null, '06:00', '20:00');
  perform public.invite_staff(a, 'mg@fin.example', jsonb_build_array(jsonb_build_object('unit_id', u1, 'role', 'manager'), jsonb_build_object('unit_id', u2, 'role', 'manager')));
  perform public.invite_staff(a, 'fi@fin.example', jsonb_build_array(jsonb_build_object('unit_id', u1, 'role', 'finance')));
  perform public.invite_staff(a, 'at@fin.example', jsonb_build_array(jsonb_build_object('unit_id', u1, 'role', 'attendant')));
  inv := public.invite_instructor(a, 'ins@fin.example', array[u1], 5500);
  perform pg_temp.reset();
  perform pg_temp.act_as(mg); perform public.accept_company_invitation((select id from public.company_invitations where email = 'mg@fin.example')); perform pg_temp.reset();
  perform pg_temp.act_as(fi); perform public.accept_company_invitation((select id from public.company_invitations where email = 'fi@fin.example')); perform pg_temp.reset();
  perform pg_temp.act_as(at_); perform public.accept_company_invitation((select id from public.company_invitations where email = 'at@fin.example')); perform pg_temp.reset();
  perform pg_temp.act_as(ins); perform public.accept_company_invitation(inv); perform public.save_my_schedule(array[0,1,2,3,4,5,6], '07:00', '18:00', 0); perform pg_temp.reset();
  select id into link from public.company_instructor_links where company_id = a;
  perform pg_temp.act_as(o2); perform public.create_unit(b, 'Unidade B', 'Camocim', 'Orla da Barra, 8', null, null, '06:00', '20:00'); perform pg_temp.reset();
  perform pg_temp.act_as(o1);
  svc := public.create_service(a, 'Aula iniciante', 120, 2, '', 26000);
  perform public.set_unit_service(svc, u1, 'Praia', array[0,1,2,3,4,5,6]::smallint[], array[link], true);
  p1 := public.create_product(a, 'CAM-VK', 'Camiseta VentoKite', 'Vestuário', 6000, 0);
  perform public.record_stock_movement(u1, p1, 'in', 5, 'Estoque inicial');
  bk1 := public.create_external_booking(u1, svc, ins::uuid, 'Cliente Um', '88999990001', pg_temp.at(3, '08:00'));
  bk2 := public.create_external_booking(u1, svc, ins::uuid, 'Cliente Dois', '88999990002', pg_temp.at(3, '12:00'));
  perform public.set_cash_settings(u1, 'shift', 80, array['closing']);
  cx := public.open_cash_session(u1, 10000, 'Operador');
  perform public.sell_product(cx, p1, 2, 'cash'); perform public.record_cash_movement(cx, 'expense', 2500, 'Água para os alunos'); perform public.record_booking_payment(cx, bk1, 'card_external');
  perform pg_temp.reset();

  -- 1. Lançamentos: só quem tem finance.edit na unidade; append-only; correção por estorno, uma vez.
  perform pg_temp.act_as(fi);
  e_rev := public.record_fin_entry(u1, 'revenue', 'Patrocínio', 50000, today, 'Apoio da loja parceira');
  e_exp := public.record_fin_entry(u1, 'expense', 'Aluguel', 20000, today - 1, 'Aluguel do espaço');
  begin perform public.record_fin_entry(u1, 'expense', 'Aluguel', 20000, today + 1, 'Data futura'); raise exception 'future entry'; exception when invalid_parameter_value then null; end;
  begin perform public.record_fin_entry(u1, 'expense', 'Aluguel', 0, today, 'Valor zero'); raise exception 'zero entry'; exception when invalid_parameter_value then null; end;
  begin perform public.record_fin_entry(u1, 'lucro', 'Aluguel', 100, today, 'Tipo inválido'); raise exception 'bad kind'; exception when check_violation then null; end;
  begin perform public.record_fin_entry(u2, 'expense', 'Aluguel', 100, today, 'Unidade sem vínculo'); raise exception 'finance of U1 wrote in U2'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(mg); begin perform public.record_fin_entry(u1, 'expense', 'Aluguel', 100, today, 'Gerente lançando'); raise exception 'manager without finance.edit wrote'; exception when insufficient_privilege then null; end;
  begin perform public.reverse_fin_entry(e_exp, 'Gerente estornando'); raise exception 'manager reversed'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(fi);
  begin perform public.reverse_fin_entry(e_exp, 'x'); raise exception 'reversal without reason'; exception when invalid_parameter_value then null; end;
  e_back := public.reverse_fin_entry(e_exp, 'Lançado em duplicidade');
  begin perform public.reverse_fin_entry(e_exp, 'Estornando de novo'); raise exception 'reversed twice'; exception when unique_violation then null; end;
  begin perform public.reverse_fin_entry(e_back, 'Estorno do estorno'); raise exception 'reversed a reversal'; exception when object_not_in_prerequisite_state then null; end;
  perform pg_temp.reset();
  assert (select cents from public.company_fin_entries where id = e_back) = -20000 and (select sum(cents) from public.company_fin_entries where kind = 'expense' and unit_id = u1) = 0, 'the reversal cancels the entry';
  begin update public.company_fin_entries set cents = 1 where id = e_rev; raise exception 'entry edited'; exception when insufficient_privilege then null; end;
  begin delete from public.company_fin_entries where id = e_rev; raise exception 'entry deleted'; exception when insufficient_privilege then null; end;
  begin insert into public.company_fin_entries (company_id, unit_id, kind, category, cents, entry_date, note, created_by) values (a, u1, 'revenue', 'Negativo', -100, today, 'Sem estorno', o1::uuid); raise exception 'negative without reversal'; exception when check_violation then null; end;

  -- 2. Contas a pagar e a receber: baixa nunca passa do valor; conta com baixa não é cancelada.
  perform pg_temp.act_as(fi);
  d1 := public.create_due(u1, 'payable', 'Oficina do Vento', today + 5, 12000, 'Conserto de prancha');
  d2 := public.create_due(u1, 'receivable', 'Pousada Sol', today - 2, 30000);
  d3 := public.create_due(u1, 'payable', 'Fornecedor errado', today + 9, 5000);
  perform public.record_due_payment(d1, 5000, today, 'Primeira parte');
  begin perform public.record_due_payment(d1, 8000, today); raise exception 'paid above the account'; exception when check_violation then null; end;
  begin perform public.record_due_payment(d1, 1000, today + 1); raise exception 'future payment'; exception when invalid_parameter_value then null; end;
  perform public.record_due_payment(d1, 7000, today);
  begin perform public.record_due_payment(d1, 1, today); raise exception 'paid a settled account'; exception when check_violation then null; end;
  perform public.record_due_payment(d2, 10000, today - 1);
  begin perform public.cancel_due(d1, 'Cancelar conta paga'); raise exception 'cancelled an account with payments'; exception when object_not_in_prerequisite_state then null; end;
  begin perform public.cancel_due(d3, 'x'); raise exception 'cancel without reason'; exception when invalid_parameter_value then null; end;
  perform public.cancel_due(d3, 'Lançada por engano');
  begin perform public.record_due_payment(d3, 100, today); raise exception 'paid a cancelled account'; exception when object_not_in_prerequisite_state then null; end;
  perform pg_temp.reset();
  assert public.company_due_status(12000, 12000, today + 5, false) = 'paid' and public.company_due_status(30000, 10000, today - 2, false) = 'overdue'
    and public.company_due_status(5000, 2000, today + 5, false) = 'partial' and public.company_due_status(5000, 0, today + 5, false) = 'open' and public.company_due_status(5000, 0, today + 5, true) = 'cancelled', 'derived status';
  begin insert into public.company_due_payments (due_id, cents, paid_on, created_by) values (d2, 20001, today, o1::uuid); raise exception 'direct payment above the account'; exception when check_violation then null; end;
  begin update public.company_dues set cents = 1 where id = d2; raise exception 'account edited'; exception when insufficient_privilege then null; end;
  begin update public.company_due_payments set cents = 1 where due_id = d1; raise exception 'payment edited'; exception when insufficient_privilege then null; end;
  perform pg_temp.act_as(mg); begin perform public.create_due(u1, 'payable', 'Gerente', today, 100); raise exception 'manager created an account'; exception when insufficient_privilege then null; end;
  assert (select count(*) from public.company_dues where unit_id = u1) = 3, 'the manager reads (finance.reports)'; perform pg_temp.reset();

  -- 3. Pagamento externo ao instrutor: nunca acima do devido (comissões congeladas das aulas concluídas).
  perform pg_temp.act_as(fi); begin perform public.record_instructor_payment(link, 1, 'pix', 'PIX-0'); raise exception 'paid before any lesson was done'; exception when check_violation then null; end; perform pg_temp.reset();
  update public.company_external_bookings set starts_at = now() - interval '3 hours' where id in (bk1, bk2);
  perform pg_temp.act_as(at_); perform public.complete_external_booking(bk1); perform public.complete_external_booking(bk2); perform pg_temp.reset();
  perform pg_temp.act_as(fi);
  select * into r from public.instructor_balance(link); assert (r.due_cents, r.paid_cents, r.balance_cents, r.unconfirmed_cents) = (28600, 0, 28600, 0), 'owed = 2 x 14300 frozen commissions';
  pay1 := public.record_instructor_payment(link, 20000, 'pix', 'PIX-A1B2');
  begin perform public.record_instructor_payment(link, 9000, 'pix', 'PIX-X'); raise exception 'paid above the balance'; exception when check_violation then null; end;
  pay2 := public.record_instructor_payment(link, 8600, 'ted', 'TED-9921');
  begin perform public.record_instructor_payment(link, 1, 'pix', 'PIX-Y'); raise exception 'paid a settled balance'; exception when check_violation then null; end;
  begin perform public.record_instructor_payment(link, 100, 'boleto', 'BOL-1'); raise exception 'bad method'; exception when check_violation then null; end;
  begin perform public.record_instructor_payment(link, 100, 'pix', 'x'); raise exception 'short reference'; exception when check_violation then null; end;
  begin perform public.confirm_instructor_payment(pay1); raise exception 'the school confirmed for the instructor'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(mg); begin perform public.record_instructor_payment(link, 100, 'pix', 'PIX-M'); raise exception 'manager recorded a payment'; exception when insufficient_privilege then null; end; perform pg_temp.reset();
  perform pg_temp.act_as(at_); begin perform public.record_instructor_payment(link, 100, 'pix', 'PIX-T'); raise exception 'attendant recorded a payment'; exception when insufficient_privilege then null; end;
  assert (select count(*) from public.company_instructor_payments) = 0, 'the attendant does not read payments'; perform pg_temp.reset();

  -- 4. O instrutor vê o que lhe devem e confirma o recebimento, uma vez.
  perform pg_temp.act_as(ins);
  select * into r from public.my_company_earnings();
  assert (r.due_cents, r.paid_cents, r.balance_cents, r.unconfirmed_cents) = (28600, 28600, 0, 28600) and r.company_name = 'Escola FA', 'the instructor sees the totals';
  assert (select count(*) from public.company_instructor_payments) = 2, 'and the payment records';
  perform public.confirm_instructor_payment(pay1);
  begin perform public.confirm_instructor_payment(pay1); raise exception 'confirmed twice'; exception when object_not_in_prerequisite_state then null; end;
  begin perform public.void_instructor_payment(pay2, 'Instrutor anulando'); raise exception 'the instructor voided'; exception when insufficient_privilege then null; end;
  begin perform public.record_instructor_payment(link, 1, 'pix', 'PIX-SELF'); raise exception 'the instructor recorded a payment to himself'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(ins2);
  begin perform public.confirm_instructor_payment(pay2); raise exception 'another instructor confirmed'; exception when insufficient_privilege then null; end;
  begin perform public.instructor_balance(link); raise exception 'another instructor read the balance'; exception when insufficient_privilege then null; end;
  assert (select count(*) from public.company_instructor_payments) = 0 and (select count(*) from public.my_company_earnings()) = 0, 'another instructor sees nothing';
  perform pg_temp.reset();

  -- 5. Anulação: só registro não confirmado, com motivo; libera o saldo; o registro fica.
  perform pg_temp.act_as(fi);
  begin perform public.void_instructor_payment(pay1, 'Anular confirmado'); raise exception 'voided a confirmed payment'; exception when object_not_in_prerequisite_state then null; end;
  begin perform public.void_instructor_payment(pay2, 'x'); raise exception 'void without reason'; exception when invalid_parameter_value then null; end;
  perform public.void_instructor_payment(pay2, 'Referência digitada errada');
  begin perform public.void_instructor_payment(pay2, 'Anulando de novo'); raise exception 'voided twice'; exception when object_not_in_prerequisite_state then null; end;
  select * into r from public.instructor_balance(link); assert (r.due_cents, r.paid_cents, r.balance_cents, r.unconfirmed_cents) = (28600, 20000, 8600, 0), 'a voided record no longer counts';
  pay3 := public.record_instructor_payment(link, 8600, 'ted', 'TED-9922');
  perform pg_temp.reset();
  perform pg_temp.act_as(ins); begin perform public.confirm_instructor_payment(pay2); raise exception 'confirmed a voided payment'; exception when object_not_in_prerequisite_state then null; end; perform pg_temp.reset();
  assert (select count(*) from public.company_instructor_payments where link_id = link) = 3, 'nothing is deleted';
  begin update public.company_instructor_payments set cents = 1 where id = pay3; raise exception 'payment amount edited'; exception when insufficient_privilege then null; end;
  begin update public.company_instructor_payments set confirmed_at = null where id = pay1; raise exception 'confirmation removed'; exception when insufficient_privilege then null; end;
  begin delete from public.company_instructor_payments where id = pay3; raise exception 'payment deleted'; exception when insufficient_privilege then null; end;
  begin insert into public.company_instructor_payments (company_id, link_id, instructor_id, cents, method, reference, paid_on, created_by) values (a, link, ins::uuid, 1, 'pix', 'DIRETO', today, o1::uuid); raise exception 'direct payment above the balance'; exception when check_violation then null; end;
  begin insert into public.company_instructor_payments (company_id, link_id, instructor_id, cents, method, reference, paid_on, created_by) values (a, link, ins2::uuid, 1, 'pix', 'DIRETO', today, o1::uuid); raise exception 'payment to someone who is not the linked instructor'; exception when invalid_parameter_value then null; end;
  assert (select status from public.instructors where id = ins::uuid) = 'approved', 'nothing here touches the instructor on the platform';

  -- 6. Resumo por unidade: só as unidades em que a pessoa vê relatórios.
  perform pg_temp.act_as(fi);
  select * into r from public.company_finance_summary(a, today - 2, today) where unit_id = u1;
  assert (r.revenue_cents, r.expense_cents, r.instructor_commission_cents, r.result_cents) = (88000, 2500, 28600, 56900), 'revenue 12000 + 26000 cash sales + 50000 entry; expense 2500 (entry reversed); commission 28600';
  assert (select count(*) from public.company_finance_summary(a, today - 2, today)) = 1, 'finance of U1 gets one unit';
  begin perform public.company_finance_summary(a, today, today - 1); raise exception 'inverted period'; exception when invalid_parameter_value then null; end;
  begin perform public.company_finance_summary(a, today - 800, today); raise exception 'huge period'; exception when invalid_parameter_value then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(mg); assert (select count(*) from public.company_finance_summary(a, today - 2, today)) = 2, 'the manager of both units gets two'; perform pg_temp.reset();
  perform pg_temp.act_as(at_); assert (select count(*) from public.company_finance_summary(a, today - 2, today)) = 0 and (select count(*) from public.company_fin_entries) = 0 and (select count(*) from public.company_dues) = 0, 'the attendant sees no finance'; perform pg_temp.reset();
  perform pg_temp.act_as(ins); assert (select count(*) from public.company_finance_summary(a, today - 2, today)) = 0 and (select count(*) from public.company_fin_entries) = 0, 'the instructor sees no company finance'; perform pg_temp.reset();

  -- 7. Isolamento, anon e escrita direta.
  perform pg_temp.act_as(o2);
  assert (select count(*) from public.company_fin_entries where company_id = a) = 0 and (select count(*) from public.company_dues where company_id = a) = 0
    and (select count(*) from public.company_due_payments) = 0 and (select count(*) from public.company_instructor_payments where company_id = a) = 0
    and (select count(*) from public.company_finance_summary(a, today - 2, today)) = 0, 'B sees nothing of A';
  begin perform public.record_instructor_payment(link, 1, 'pix', 'PIX-B'); raise exception 'B recorded a payment in A'; exception when insufficient_privilege then null; end;
  begin perform public.instructor_balance(link); raise exception 'B read a balance of A'; exception when insufficient_privilege then null; end;
  begin perform public.record_due_payment(d2, 100, today); raise exception 'B paid an account of A'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  perform pg_temp.act_as(fi);
  begin insert into public.company_fin_entries (company_id, unit_id, kind, category, cents, entry_date, note, created_by) values (a, u1, 'revenue', 'Direto', 100, today, 'Direto', fi::uuid); raise exception 'client inserted an entry'; exception when insufficient_privilege then null; end;
  begin update public.company_instructor_payments set confirmed_at = now() where id = pay3; raise exception 'client confirmed directly'; exception when insufficient_privilege then null; end;
  begin perform public.company_instructor_due_cents(link); raise exception 'internal function callable'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  execute 'set role anon';
  begin perform count(*) from public.company_instructor_payments; raise exception 'anon read payments'; exception when insufficient_privilege then null; end;
  begin perform public.my_company_earnings(); raise exception 'anon called earnings'; exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
  select count(*) into n from public.company_audit_logs where company_id = a and action like 'finance.%';
  assert n >= 12, 'finance actions are audited';
  assert not exists (select 1 from public.company_instructor_links l where public.company_instructor_paid_cents(l.id) > public.company_instructor_due_cents(l.id)), 'nobody was paid above what is owed';
  assert not exists (select 1 from public.company_dues d where (select coalesce(sum(cents), 0) from public.company_due_payments p where p.due_id = d.id) > d.cents), 'no account paid above its amount';
end $$;

do $$ declare t text; f text; begin
  foreach t in array array['company_fin_entries','company_dues','company_due_payments','company_instructor_payments'] loop
    assert (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), t || ' has RLS';
    assert not has_table_privilege('authenticated', 'public.' || t, 'INSERT') and not has_table_privilege('authenticated', 'public.' || t, 'UPDATE') and not has_table_privilege('authenticated', 'public.' || t, 'DELETE'), t || ' is read-only for clients';
    assert not has_table_privilege('anon', 'public.' || t, 'SELECT'), t || ' is closed to anon';
  end loop;
  foreach f in array array['company_due_payment_guard','company_instructor_payment_guard','company_instructor_due_cents','company_instructor_paid_cents','record_fin_entry','reverse_fin_entry','create_due',
      'record_due_payment','cancel_due','record_instructor_payment','confirm_instructor_payment','void_instructor_payment','instructor_balance','my_company_earnings','company_finance_summary'] loop
    assert (select bool_and(p.prosecdef and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f), f || ' is definer with a fixed search_path';
  end loop;
end $$;

select 'PASS: business finance (append-only entries with reversal, accounts never overpaid, external instructor payments never above what is owed and confirmed by the instructor, scoped summary, isolation)';
