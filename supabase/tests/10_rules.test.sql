-- Business-rule tests for the Vento schema. Each block raises on failure.
-- Run with scripts/test-db.sh.

\set ON_ERROR_STOP on
set client_min_messages = warning;

-- Users: one admin, two instructors, one student, another student, one partner.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test', '{"full_name":"Admin","role":"admin"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'rafael@test', '{"full_name":"Rafael Lima","role":"instructor"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'marina@test', '{"full_name":"Marina Costa","role":"instructor"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'luana@test', '{"full_name":"Luana"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'outra@test', '{"full_name":"Outra"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'pousada@test', '{"full_name":"Recepção","role":"partner"}');

-- Admin is never self-assigned at sign-up.
do $$ begin
  assert (select role from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'student',
    'sign-up must not be able to request admin';
end $$;
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';

-- Helpers to act as a user.
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

-- Instructors fill in their profile.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
update public.instructors set languages = '{Português,Inglês}', years_experience = 8 where id = auth.uid();
select public.set_my_beaches(array(select id from public.beaches where slug in ('prea', 'jeri')));
-- An instructor cannot approve themselves or jump the queue.
do $$ begin
  begin
    update public.instructors set status = 'approved', queue_position = 0 where id = auth.uid();
    raise exception 'instructor changed own status';
  exception when insufficient_privilege then null; end;
end $$;
select pg_temp.reset();
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
update public.instructors set languages = '{Português}' where id = auth.uid();
select public.set_my_beaches(array(select id from public.beaches where slug = 'prea'));
select pg_temp.reset();

-- A student cannot change their own role.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
do $$ begin
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'student changed own role';
  exception when insufficient_privilege then null; end;
  begin
    perform public.set_instructor_status('00000000-0000-0000-0000-0000000000a1', 'approved', 'x');
    raise exception 'student approved an instructor';
  exception when insufficient_privilege then null; end;
end $$;
select pg_temp.reset();

-- Admin approves Rafael then Marina: queue order follows approval order.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select public.set_instructor_status('00000000-0000-0000-0000-0000000000a1', 'approved', 'Documentos ok');
select public.set_instructor_status('00000000-0000-0000-0000-0000000000a2', 'approved', 'Documentos ok');
select pg_temp.reset();

-- Partner registers; admin approves.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select public.register_partner('Pousada Mar & Vento', (select id from public.beaches where slug = 'prea'));
select pg_temp.reset();
update public.partners set code = 'MAR-E-VENTO';
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select public.set_partner_status((select id from public.partners), 'approved', 'ok');
select pg_temp.reset();

-- Quote preview is public and computed by the server.
set role anon;
do $$ begin
  assert (select total_cents from public.quote_preview(2)) = 60000, 'quote for 2h must be R$ 600';
  assert (select total_cents from public.quote_table() where hours = 8) = 240000, 'quote table for 8h';
  begin
    perform count(*) from public.profiles;
    raise exception 'anon read profiles';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Luana books 2 + 3 hours in Preá, referred by the inn.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select public.create_booking((select id from public.beaches where slug = 'prea'), 'first_time', 'Português',
  jsonb_build_array(
    jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'hours', 2),
    jsonb_build_object('starts_at', (now() + interval '3 days')::text, 'hours', 3)),
  'mar-e-vento') as booking_id \gset
select set_config('test.booking_id', :'booking_id', false);
do $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = current_setting('test.booking_id')::uuid;
  assert b.total_hours = 5, 'total hours';
  assert b.total_cents = 150000, 'R$ 1.500 for 5h at R$ 300';
  -- 15% commission = 22500, of which 5% (7500) goes to the inn.
  assert b.partner_cents = 7500, format('partner %s', b.partner_cents);
  assert b.platform_cents = 15000, format('platform %s', b.platform_cents);
  assert b.instructor_net_cents = 127500, format('net %s', b.instructor_net_cents);
  assert b.instructor_id = '00000000-0000-0000-0000-0000000000a1', 'first in queue gets the booking';
  assert (select count(*) from public.booking_meetings where booking_id = b.id) = 2, 'two meetings';
end $$;

-- Students cannot write bookings directly, nor pass a price anywhere.
do $$ begin
  begin
    update public.bookings set total_cents = 1 where id = current_setting('test.booking_id')::uuid;
    raise exception 'student updated booking';
  exception when insufficient_privilege then null; end;
end $$;
select pg_temp.reset();

-- Another student cannot see or pay Luana's booking (IDOR).
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
do $$ begin
  assert (select count(*) from public.bookings) = 0, 'other student sees no bookings';
  assert (select count(*) from public.booking_meetings) = 0, 'other student sees no meetings';
  begin
    perform public.confirm_test_payment(current_setting('test.booking_id')::uuid);
    raise exception 'other student paid booking';
  exception when no_data_found then null; end;
end $$;
select pg_temp.reset();

-- The partner sees aggregates only.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
do $$ begin
  assert (select count(*) from public.bookings) = 0, 'partner cannot read bookings';
  assert (select pending_cents from public.partner_summary()) = 7500, 'partner pending commission';
end $$;
select pg_temp.reset();

-- Payment confirms and sends Rafael to the end of the queue.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select public.confirm_test_payment(current_setting('test.booking_id')::uuid);
select pg_temp.reset();
do $$ begin
  assert (select status from public.bookings where id = current_setting('test.booking_id')::uuid) = 'confirmed', 'confirmed';
  assert (select id from public.instructors where status = 'approved' order by queue_position limit 1)
    = '00000000-0000-0000-0000-0000000000a2', 'Marina is now first';
end $$;

-- Overlap: only Rafael serves Jericoacoara, and he already teaches Luana two
-- days from now. A Jericoacoara request for that slot finds nobody; one on a
-- free day goes to him.
do $$
declare got_none boolean := false;
begin
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
  begin
    perform public.create_booking((select id from public.beaches where slug = 'jeri'), 'returning', 'Português',
      jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '2 days 30 minutes')::text, 'hours', 1)));
  exception when raise_exception then
    got_none := sqlerrm = 'No instructor available for these slots';
  end;
  assert got_none, 'overlapping slot must not be assigned';
  perform public.create_booking((select id from public.beaches where slug = 'jeri'), 'returning', 'Português',
    jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '5 days')::text, 'hours', 1)));
  perform pg_temp.reset();
  assert (select instructor_id from public.bookings where student_id = '00000000-0000-0000-0000-0000000000b2')
    = '00000000-0000-0000-0000-0000000000a1', 'free slot goes to Rafael';
end $$;

-- Instructor flow: wrong presence code is refused, right one starts, minutes
-- are recorded and capped at the scheduled duration.
do $$
declare m uuid; pcode text;
begin
  select bm.id, b.presence_code into m, pcode from public.booking_meetings bm
    join public.bookings b on b.id = bm.booking_id
    where b.id = (select id from public.bookings where code = 'VNT-1001') and bm.position = 1;
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
  begin
    perform public.start_meeting(m, pcode);
    raise exception 'unassigned instructor started a meeting';
  exception when no_data_found then null; end;
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
  begin
    perform public.start_meeting(m, case when pcode = '0000' then '0001' else '0000' end);
    raise exception 'wrong presence code accepted';
  exception when invalid_parameter_value then null; end;
  perform public.start_meeting(m, pcode);
  begin
    perform public.record_meeting(m, 500, 'too long');
    raise exception 'recorded more than scheduled';
  exception when invalid_parameter_value then null; end;
  perform public.record_meeting(m, 90, 'Controle básico do kite');
  perform pg_temp.reset();
  assert (select done_minutes from public.booking_meetings where id = m) = 90, 'done minutes';
end $$;

-- The financial snapshot is frozen, even for the table owner.
do $$ begin
  begin
    update public.bookings set total_cents = 1, total_hours = 1, hourly_rate_cents = 1,
      instructor_net_cents = 1, platform_cents = 0, partner_cents = 0 where code = 'VNT-1001';
    raise exception 'snapshot changed';
  exception when insufficient_privilege then null; end;
end $$;

-- A new price does not change existing bookings; price rows are immutable.
do $$ begin
  perform pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
  perform public.publish_price_version(35000, 1500, 12000, 'Alta temporada');
  perform pg_temp.reset();
  assert (select total_cents from public.bookings where code = 'VNT-1001') = 150000, 'old booking keeps price';
  assert (select hourly_rate_cents from public.quote_preview(1)) = 35000, 'new quotes use new price';
  begin
    update public.price_versions set hourly_rate_cents = 1;
    raise exception 'price version edited';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.audit_logs;
    raise exception 'audit log deleted';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.audit_logs where action = 'price.published') = 1, 'price change audited';
end $$;

-- Split always reconciles to the centavo.
do $$
declare t integer; r record;
begin
  for t in select generate_series(1, 2000) * 137 loop
    select * into r from public.split_total(t, 1500, 500);
    assert r.partner_cents + r.platform_cents + r.instructor_net_cents = t, format('split of %s', t);
  end loop;
end $$;

-- Beaches are managed by the admin; students and instructors cannot.
do $$
declare new_beach uuid; got_error boolean := false;
begin
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
  begin
    perform public.create_beach('Praia Falsa', 'Ceará');
  exception when insufficient_privilege then got_error := true;
  end;
  assert got_error, 'student created a beach';
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
  new_beach := public.create_beach('Praia do Guriú', 'Ceará');
  perform pg_temp.reset();
  assert (select slug from public.beaches where id = new_beach) = 'praia-do-guriu', 'slug without accents';

  -- Marina adds the new beach; a booking there goes to her, not to Rafael.
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
  perform public.set_my_beaches(array[(select id from public.beaches where slug = 'prea'), new_beach]);
  perform pg_temp.reset();
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
  perform public.create_booking(new_beach, 'first_time', 'Português',
    jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '9 days')::text, 'hours', 1)));
  perform pg_temp.reset();
  assert (select instructor_id from public.bookings where beach_id = new_beach)
    = '00000000-0000-0000-0000-0000000000a2', 'only instructors of that beach are matched';

  -- A deactivated beach is no longer bookable and is hidden from students.
  perform pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
  perform public.update_beach(new_beach, 'Praia do Guriú', 'Ceará', false);
  perform pg_temp.reset();
  execute 'set role anon';
  assert not exists (select 1 from public.beaches where id = new_beach), 'inactive beach hidden from visitors';
  perform pg_temp.reset();
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
  got_error := false;
  begin
    perform public.create_booking(new_beach, 'first_time', 'Português',
      jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '10 days')::text, 'hours', 1)));
  exception when invalid_parameter_value then got_error := true;
  end;
  assert got_error, 'booked an inactive beach';
  perform pg_temp.reset();
  assert (select count(*) from public.audit_logs where entity = 'beach') = 2, 'beach changes audited';
end $$;

-- Support vehicle: only instructors with one are matched; the transport
-- amount is added to the total and to the instructor's net, commissions stay
-- on the lesson.
do $$
declare b public.bookings; got_none boolean := false;
begin
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
  begin
    perform public.create_booking((select id from public.beaches where slug = 'prea'), 'first_time', 'Português',
      jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '12 days')::text, 'hours', 2)), null, true);
  exception when raise_exception then
    got_none := sqlerrm = 'No instructor available for these slots';
  end;
  assert got_none, 'nobody has a vehicle yet';
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
  update public.instructors set has_support_vehicle = true where id = auth.uid();
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
  perform public.create_booking((select id from public.beaches where slug = 'prea'), 'first_time', 'Português',
    jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '12 days')::text, 'hours', 2)), null, true);
  perform pg_temp.reset();

  select * into b from public.bookings where with_transport order by created_at desc limit 1;
  assert b.instructor_id = '00000000-0000-0000-0000-0000000000a2', 'only the instructor with a vehicle';
  -- Current price: R$ 350/h lesson, 15%, R$ 120/h transport; 2 hours.
  assert b.transport_cents = 24000, format('transport %s', b.transport_cents);
  assert b.total_cents = 70000 + 24000, format('total %s', b.total_cents);
  assert b.platform_cents = 10500, format('platform %s', b.platform_cents);
  assert b.instructor_net_cents = 59500 + 24000, format('net %s', b.instructor_net_cents);
  assert b.partner_cents + b.platform_cents + b.instructor_net_cents = b.total_cents, 'split reconciles';

  begin
    update public.bookings set transport_cents = 0 where id = b.id;
    raise exception 'transport snapshot changed';
  exception when insufficient_privilege then null; end;
  assert (select total_with_transport_cents from public.quote_table() where hours = 2) = 94000, 'quote with transport';
end $$;

select 'ALL TESTS PASSED' as result;
