-- 99: admin test lessons must be visible without producing real payment or commission.
\set ON_ERROR_STOP on

create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',uid,false);
  execute 'set role authenticated';
end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',false);
end $$;

do $$
declare
  v_id uuid;
  v_start timestamptz;
  v_queue bigint;
  v_student uuid:='00000000-0000-0000-0000-0000000000b2';
  v_instructor uuid:='00000000-0000-0000-0000-0000000000a2';
  v_beach uuid;
begin
  v_start:=(((now() at time zone 'America/Fortaleza')::date + 51)::timestamp
    + interval '11 hours') at time zone 'America/Fortaleza';
  select id into v_beach from public.beaches where slug='prea';
  select queue_position into v_queue from public.instructors where id=v_instructor;
  assert v_beach is not null,'fixture requires Preá beach';

  perform pg_temp.act_as(v_student::text);
  begin
    perform public.create_admin_test_lesson(v_instructor,v_student,v_beach,v_start,2);
    raise exception 'A student created a privileged test booking';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
  v_id:=public.create_admin_test_lesson(v_instructor,v_student,v_beach,v_start,2);

  -- A second attempt at the same instructor and interval must be rejected.
  -- A business conflict is not an unexpected technical failure.
  begin
    perform public.create_admin_test_lesson(v_instructor,v_student,v_beach,v_start,2);
    raise exception 'A simultaneous test lesson was incorrectly accepted';
  exception
    when sqlstate '55000' then
      if SQLERRM <> 'Instructor has a class or block at the selected time' then
        raise exception 'Unexpected 55000 in test booking: %', SQLERRM;
      end if;
  end;
  perform pg_temp.reset();

  assert exists(select 1 from public.bookings
    where id=v_id and is_test and status='confirmed' and partner_id is null
      and code like 'VNT-TEST-%'), 'test booking is explicitly tagged and confirmed';
  assert exists(select 1 from public.booking_meetings
    where booking_id=v_id and status='scheduled' and minutes=120),
    'instructor schedule includes the test meeting';
  assert not exists(select 1 from public.test_payment_attempts
    where booking_id=v_id), 'test booking moves no payment';
  assert (select queue_position from public.instructors
    where id=v_instructor) is not distinct from v_queue,
    'creating test booking never changes instructor queue';
  assert exists(select 1 from public.audit_logs
    where entity_id=v_id::text and action='booking.test_created'),
    'test booking creation is audited';

  perform pg_temp.act_as(v_instructor::text);
  assert (select count(*) from public.bookings where id=v_id)=1,
    'assigned instructor reads test booking under RLS';
  assert (select count(*) from public.booking_meetings where booking_id=v_id)=1,
    'assigned instructor reads scheduled meeting';
  perform pg_temp.reset();

  perform pg_temp.act_as(v_student::text);
  assert (select count(*) from public.bookings where id=v_id)=1,
    'selected student sees same test booking';
  begin
    perform public.cancel_admin_test_lesson(v_id);
    raise exception 'Student cancelled admin test booking';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
  perform public.cancel_admin_test_lesson(v_id);
  perform pg_temp.reset();

  assert (select status from public.bookings where id=v_id)='cancelled',
    'admin cancels test booking after verification';
  assert (select status from public.booking_meetings where booking_id=v_id)='cancelled',
    'test meeting no longer blocks teacher schedule';
  assert exists(select 1 from public.audit_logs
    where entity_id=v_id::text and action='booking.test_cancelled'),
    'test cancellation is audited';
end $$;
