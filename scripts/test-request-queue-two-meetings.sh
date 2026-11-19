#!/usr/bin/env bash
# P0 integration: student request -> instructor offer -> accepted booking -> 2 lessons.
# Runs ONLY against the disposable PostgreSQL instance from scripts/test-db.sh.
set -euo pipefail
: "${PG_TEST_SOCKET:?Disposable PostgreSQL socket required}"
: "${PG_TEST_PORT:?Disposable PostgreSQL port required}"
psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare
  v_beach uuid;
  v_first timestamptz;
  v_second timestamptz;
  v_slots jsonb;
  v_request uuid;
  v_offer uuid;
  v_instructor uuid;
  v_booking uuid;
  v_pin text;
  v_m1 uuid;
  v_m2 uuid;
  v_n integer;
begin
  select id into strict v_beach from public.beaches where slug='prea';
  with slots as (
    select (date_trunc('day',now() at time zone 'America/Fortaleza')
      +make_interval(days=>d,hours=>h)) at time zone 'America/Fortaleza' st
    from generate_series(21,45) d cross join generate_series(8,14) h
  ), available as (
    select st,(st at time zone 'America/Fortaleza')::date local_day
    from slots where public.instructor_can_attend(
      '00000000-0000-0000-0000-0000000000a1'::uuid,
      jsonb_build_array(jsonb_build_object('starts_at',st,'hours',2)))
  )
  select a.st,b.st into v_first,v_second
  from available a join available b on b.local_day>a.local_day
  where public.instructor_can_attend(
    '00000000-0000-0000-0000-0000000000a1'::uuid,
    jsonb_build_array(jsonb_build_object('starts_at',a.st,'hours',2),
                      jsonb_build_object('starts_at',b.st,'hours',2)))
  order by a.st,b.st limit 1;
  if v_first is null then raise exception 'No eligible pair of 2h slots for fixture'; end if;
  v_slots:=jsonb_build_array(jsonb_build_object('starts_at',v_first,'hours',2),
                              jsonb_build_object('starts_at',v_second,'hours',2));
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
  execute 'set local role authenticated';
  v_request:=public.create_instructor_request(v_beach,'first_time','Português',v_slots);
  execute 'reset role';
  select id,instructor_id into strict v_offer,v_instructor
    from public.instructor_offers where request_id=v_request and status='offered';
  perform set_config('request.jwt.claim.sub',v_instructor::text,true);
  execute 'set local role authenticated';
  v_booking:=public.accept_instructor_offer(v_offer);
  execute 'reset role';
  if v_booking is null then raise exception 'Offer acceptance did not return booking'; end if;
  if not exists(select 1 from public.bookings where id=v_booking
    and student_id='00000000-0000-0000-0000-0000000000b2'
    and instructor_id=v_instructor and total_hours=4) then
    raise exception 'Queue booking owner, instructor or 4h total incorrect';
  end if;
  if (select count(*) from public.booking_meetings where booking_id=v_booking)<>2
    or (select sum(minutes) from public.booking_meetings where booking_id=v_booking)<>240 then
    raise exception 'Accepted request did not create 2x120-minute meetings';
  end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
  execute 'set local role authenticated';
  perform public.confirm_test_payment(v_booking);
  execute 'reset role';
  select presence_code into strict v_pin from public.bookings where id=v_booking;
  select id into strict v_m1 from public.booking_meetings where booking_id=v_booking and position=1;
  select id into strict v_m2 from public.booking_meetings where booking_id=v_booking and position=2;
  perform set_config('request.jwt.claim.sub',v_instructor::text,true);
  execute 'set local role authenticated';
  perform public.start_meeting(v_m1,v_pin);
  perform public.record_meeting(v_m1,110,'Controle e segurança');
  perform public.start_meeting(v_m2,v_pin);
  perform public.record_meeting(v_m2,115,'Water start e bordos');
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.booking_meetings where booking_id=v_booking
    and ((id=v_m1 and done_minutes=110 and note='Controle e segurança')
      or (id=v_m2 and done_minutes=115 and note='Water start e bordos'));
  if v_n<>2 then raise exception 'Student cannot read instructor progress on both meetings'; end if;
  select public.booking_balance_minutes(v_booking) into v_n;
  if v_n is distinct from 15 then raise exception 'Student expected 15 minutes remaining, got %',v_n; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',true);
  execute 'set local role authenticated';
  if exists(select 1 from public.booking_meetings where booking_id=v_booking) then
    raise exception 'IDOR: unrelated student sees queue booking meetings';
  end if;
  execute 'reset role';
  raise notice 'PASS: request -> offer -> acceptance -> 4h/2 meetings -> 225 done -> 15 remaining';
end $$;
SQL
