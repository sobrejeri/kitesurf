-- Isolated fixture: no provider requests and all test data rolls back.
\set ON_ERROR_STOP on
begin;
do $$
declare b public.bookings; b2 public.bookings; a uuid; other_student uuid; request_id uuid := gen_random_uuid(); before_status public.booking_status; n integer;
begin
  select * into b from public.bookings limit 1;
  assert b.id is not null, 'booking fixture is required';
  select * into b2 from public.bookings where id <> b.id limit 1;
  assert b2.id is not null, 'second booking fixture is required';
  select id into other_student from public.profiles where id <> b.student_id limit 1;
  assert other_student is not null, 'another profile fixture is required';
  before_status := b.status;
  begin
    insert into public.pagarme_test_attempts (request_key, booking_id, student_id, method, amount_cents)
      values (gen_random_uuid(), b.id, other_student, 'pix', b.total_cents);
    raise exception 'wrong owner was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.pagarme_test_attempts (request_key, booking_id, student_id, method, amount_cents)
      values (gen_random_uuid(), b.id, b.student_id, 'pix', b.total_cents + 1);
    raise exception 'wrong amount was accepted';
  exception when check_violation then null; end;
  insert into public.pagarme_test_attempts (request_key, booking_id, student_id, method, amount_cents)
    values (request_id, b.id, b.student_id, 'pix', b.total_cents) returning id into a;
  begin
    insert into public.pagarme_test_attempts (request_key, booking_id, student_id, method, amount_cents)
      values (gen_random_uuid(), b.id, b.student_id, 'credit_card', b.total_cents);
    raise exception 'a duplicate unresolved payment was accepted';
  exception when unique_violation then null; end;
  begin update public.pagarme_test_attempts set status = 'approved' where id = a; raise exception 'approved without order';
  exception when check_violation then null; end;
  update public.pagarme_test_attempts set status = 'unknown' where id = a;
  begin
    insert into public.pagarme_test_attempts (request_key, booking_id, student_id, method, amount_cents)
      values (gen_random_uuid(), b.id, b.student_id, 'pix', b.total_cents);
    raise exception 'uncertain attempt allowed retry';
  exception when unique_violation then null; end;
  update public.pagarme_test_attempts set status = 'approved', provider_order_id = 'or_test1' where id = a;
  begin
    insert into public.pagarme_test_attempts (request_key, booking_id, student_id, method, amount_cents)
      values (request_id, b2.id, b2.student_id, 'credit_card', b2.total_cents);
    raise exception 'duplicate request identifier accepted';
  exception when unique_violation then null; end;
  begin update public.pagarme_test_attempts set amount_cents = 1 where id = a; raise exception 'amount changed';
  exception when check_violation then null; end;
  begin update public.pagarme_test_attempts set status = 'pending' where id = a; raise exception 'invalid state transition';
  exception when check_violation then null; end;
  assert (select status from public.bookings where id = b.id) = before_status, 'attempt does not confirm or modify booking';

  perform set_config('request.jwt.claim.sub', b.student_id::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.pagarme_test_attempts where id = a;
  assert n = 1, 'student sees their test attempt';
  begin update public.pagarme_test_attempts set status = 'refunded' where id = a; raise exception 'student wrote payment status';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000fffff', true);
  select count(*) into n from public.pagarme_test_attempts where id = a;
  assert n = 0, 'other account cannot read the attempt';
  execute 'reset role';
  execute 'set local role anon';
  begin perform count(*) from public.pagarme_test_attempts; raise exception 'anonymous account read attempts';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
end $$;
rollback;
