#!/usr/bin/env bash
# Real create_booking RPC: 4h split into two separate 2h meetings.
# Only runs against the disposable database created by scripts/test-db.sh.
set -euo pipefail
: "${PG_TEST_SOCKET:?}"
: "${PG_TEST_PORT:?}"
psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare
  v_beach uuid;
  v_first timestamptz;
  v_second timestamptz;
  v_id uuid;
  v_meetings jsonb;
  v_rate integer;
  v_price_id bigint;
  v_count integer;
  v_m1 uuid;
  v_m2 uuid;
  v_pin text;
begin
  select id into strict v_beach from public.beaches where slug='jeri';
  -- Choose two distinct local dates that meet the actual instructor schedule,
  -- instead of assuming every weekday or hour is available.
  with slots as (
    select (date_trunc('day', now() at time zone 'America/Fortaleza')
      + make_interval(days=>d, hours=>h)) at time zone 'America/Fortaleza' as st
    from generate_series(2,20) d cross join generate_series(8,16) h
  ), eligible as (
    select st, (st at time zone 'America/Fortaleza')::date as local_day
    from slots
    where public.instructor_can_attend(
      '00000000-0000-0000-0000-0000000000a1'::uuid,
      jsonb_build_array(jsonb_build_object('starts_at',st,'hours',2)))
  )
  select a.st,b.st into v_first,v_second
  from eligible a join eligible b on b.local_day>a.local_day
  where public.instructor_can_attend(
    '00000000-0000-0000-0000-0000000000a1'::uuid,
    jsonb_build_array(
      jsonb_build_object('starts_at',a.st,'hours',2),
      jsonb_build_object('starts_at',b.st,'hours',2)))
  order by a.st,b.st limit 1;
  if v_first is null or v_second is null then
    raise exception 'TEST FIXTURE: no pair of eligible days for Rafael/Jeri';
  end if;
  v_meetings:=jsonb_build_array(
    jsonb_build_object('starts_at',v_first,'hours',2),
    jsonb_build_object('starts_at',v_second,'hours',2));
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
  execute 'set local role authenticated';
  v_id:=public.create_booking(v_beach,'first_time','Português',v_meetings);
  execute 'reset role';
  if not exists (
    select 1 from public.bookings b where b.id=v_id
      and b.student_id='00000000-0000-0000-0000-0000000000b2'
      and b.instructor_id='00000000-0000-0000-0000-0000000000a1'
      and b.total_hours=4
  ) then raise exception '4h booking not persisted with expected owner/instructor'; end if;
  -- The server, not the student payload, must determine the immutable price.
  select hourly_rate_cents, price_version_id into v_rate,v_price_id
  from public.bookings where id=v_id;
  if v_rate is null or v_rate<=0 or v_price_id is null then
    raise exception 'Booking price snapshot is missing'; end if;
  if (select total_cents from public.bookings where id=v_id) <> 4*v_rate then
    raise exception 'Server-priced booking total does not match 4h'; end if;
  if (select count(*) from public.booking_meetings where booking_id=v_id)<>2 then
    raise exception 'Expected exactly two meetings'; end if;
  if (select sum(minutes) from public.booking_meetings where booking_id=v_id)<>240 then
    raise exception 'Expected exactly 240 scheduled minutes'; end if;
  if (select count(distinct (starts_at at time zone 'America/Fortaleza')::date)
      from public.booking_meetings where booking_id=v_id)<>2 then
    raise exception 'Expected meetings on two distinct local days'; end if;
  -- Exercise actual RLS as both authenticated students; no service-role reads.
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',true);
  execute 'set local role authenticated';
  select count(*) into v_count from public.bookings where id=v_id;
  if v_count<>0 then raise exception 'IDOR: another student sees booking'; end if;
  select count(*) into v_count from public.booking_meetings where booking_id=v_id;
  if v_count<>0 then raise exception 'IDOR: another student sees meetings'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
  execute 'set local role authenticated';
  select count(*) into v_count from public.booking_meetings where booking_id=v_id;
  if v_count<>2 then raise exception 'Owner cannot read both meetings'; end if;
  execute 'reset role';
  -- Simulate payment confirmation only in the disposable database.
  -- This test RPC is never invoked against production.
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
  execute 'set local role authenticated';
  perform public.confirm_test_payment(v_id);
  execute 'reset role';
  if (select status from public.bookings where id=v_id)<>'confirmed' then
    raise exception 'Test booking was not confirmed'; end if;
  select presence_code into strict v_pin from public.bookings where id=v_id;
  select id into strict v_m1 from public.booking_meetings
    where booking_id=v_id and position=1;
  select id into strict v_m2 from public.booking_meetings
    where booking_id=v_id and position=2;
  -- Verify that the assigned instructor can read both meetings and that an
  -- unrelated instructor cannot discover their IDs or scheduled dates via RLS.
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
  execute 'set local role authenticated';
  select count(*) into v_count from public.booking_meetings where booking_id=v_id;
  if v_count<>2 then raise exception 'Assigned instructor cannot read both meetings'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',true);
  execute 'set local role authenticated';
  select count(*) into v_count from public.booking_meetings where booking_id=v_id;
  if v_count<>0 then raise exception 'IDOR: unrelated instructor sees scheduled meetings'; end if;
  execute 'reset role';
  -- Disposable DB only: move booked fixture meetings to yesterday/today so
  -- ordered start is exercised without bypassing the real date guard.
  -- Pick free slots dynamically in the disposable DB: earlier test fixtures
  -- may already occupy fixed hours. Preserve overlap triggers and all grants.
  with candidates as (
    select (date_trunc('day',now() at time zone 'America/Fortaleza')
      - interval '1 day' + make_interval(hours=>h,mins=>17))
      at time zone 'America/Fortaleza' as st
    from generate_series(0,21) h
  )
  select c.st into strict v_first from candidates c
  where not exists (
    select 1 from public.booking_meetings m
    join public.bookings b on b.id=m.booking_id
    where m.booking_id<>v_id
      and b.student_id='00000000-0000-0000-0000-0000000000b2'::uuid
      and tstzrange(m.starts_at,m.starts_at+make_interval(mins=>m.minutes),'[)')
          && tstzrange(c.st,c.st+interval '2 hours','[)')
  )
  order by c.st limit 1;
  with candidates as (
    select (date_trunc('day',now() at time zone 'America/Fortaleza')
      + make_interval(hours=>h,mins=>17))
      at time zone 'America/Fortaleza' as st
    from generate_series(0,21) h
  )
  select c.st into strict v_second from candidates c
  where not exists (
    select 1 from public.booking_meetings m
    join public.bookings b on b.id=m.booking_id
    where m.booking_id<>v_id
      and b.student_id='00000000-0000-0000-0000-0000000000b2'::uuid
      and tstzrange(m.starts_at,m.starts_at+make_interval(mins=>m.minutes),'[)')
          && tstzrange(c.st,c.st+interval '2 hours','[)')
  )
  order by c.st limit 1;
  update public.booking_meetings set starts_at=v_first where id=v_m1;
  update public.booking_meetings set starts_at=v_second where id=v_m2;
  -- Student and an unrelated instructor must never start or record lessons.
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
  execute 'set local role authenticated';
  begin
    perform public.start_ordered_meeting(v_m1,v_pin);
    raise exception 'SECURITY: student started instructor meeting';
  exception when no_data_found or insufficient_privilege then null; end;
  begin
    perform public.record_meeting(v_m1,10,'unauthorized student progress');
    raise exception 'SECURITY: student recorded instructor minutes';
  exception when no_data_found or insufficient_privilege or invalid_parameter_value then null; end;
  -- Defense in depth: an authenticated student must not bypass the RPC by
  -- updating progress columns directly, even on a meeting they can read.
  begin
    update public.booking_meetings set done_minutes=120, note='forged student progress'
      where id=v_m1;
    get diagnostics v_count = row_count;
    if v_count<>0 then raise exception 'SECURITY: student directly changed meeting progress'; end if;
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',true);
  execute 'set local role authenticated';
  begin
    perform public.start_ordered_meeting(v_m1,v_pin);
    raise exception 'SECURITY: unrelated instructor started meeting';
  exception when no_data_found or insufficient_privilege then null; end;
  begin
    perform public.record_meeting(v_m1,10,'unauthorized instructor progress');
    raise exception 'SECURITY: unrelated instructor recorded minutes';
  exception when no_data_found or insufficient_privilege or invalid_parameter_value then null; end;
  begin
    update public.booking_meetings set done_minutes=120, note='forged other instructor progress'
      where id=v_m1;
    get diagnostics v_count = row_count;
    if v_count<>0 then raise exception 'SECURITY: unrelated instructor directly changed progress'; end if;
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
  execute 'set local role authenticated';
  -- Each meeting requires the valid PIN; no recorded minutes above its quota.
  begin
    perform public.start_ordered_meeting(v_m1,case when v_pin='0000' then '0001' else '0000' end);
    raise exception 'SECURITY: invalid PIN accepted for first meeting';
  exception when invalid_parameter_value then null; end;
  perform public.start_ordered_meeting(v_m1,v_pin);
  begin
    perform public.record_meeting(v_m1,121,'invalid overrun');
    raise exception 'SECURITY: instructor recorded 121 minutes for a 120-minute encounter';
  exception when invalid_parameter_value then null; end;
  perform public.record_meeting(v_m1,110,'Controle e segurança: janela de vento');
  begin
    perform public.start_ordered_meeting(v_m2,case when v_pin='0000' then '0001' else '0000' end);
    raise exception 'SECURITY: invalid PIN accepted for second meeting';
  exception when invalid_parameter_value then null; end;
  perform public.start_ordered_meeting(v_m2,v_pin);
  begin
    perform public.record_meeting(v_m2,121,'invalid second meeting overrun');
    raise exception 'SECURITY: instructor recorded 121 minutes for second 120-minute encounter';
  exception when invalid_parameter_value then null; end;
  perform public.record_meeting(v_m2,115,'Water start e primeiros bordos');
  execute 'reset role';
  -- The aggregate alone is insufficient: each lesson must retain its own
  -- instructor-entered note and exact completed minutes after both writes.
  if not exists (select 1 from public.booking_meetings
    where id=v_m1 and done_minutes=110 and note='Controle e segurança: janela de vento')
    or not exists (select 1 from public.booking_meetings
    where id=v_m2 and done_minutes=115 and note='Water start e primeiros bordos') then
    raise exception 'Per-meeting instructor progress was lost or overwritten';
  end if;
  if (select sum(done_minutes) from public.booking_meetings where booking_id=v_id)<>225 then
    raise exception 'Expected 225 actual teaching minutes across both meetings'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
  execute 'set local role authenticated';
  select count(*) into v_count from public.booking_meetings
    where booking_id=v_id and done_minutes>0 and note is not null;
  if v_count<>2 then
    raise exception 'Student cannot see progress/minutes for both encounters'; end if;
  -- Check the exact per-encounter evolution visible through student RLS.
  -- A count of two rows alone would miss swapped or overwritten notes.
  select count(*) into v_count from public.booking_meetings
    where booking_id=v_id and (
      (id=v_m1 and done_minutes=110 and note='Controle e segurança: janela de vento')
      or (id=v_m2 and done_minutes=115 and note='Water start e primeiros bordos')
    );
  if v_count<>2 then
    raise exception 'Student-visible evolution does not match both instructor records';
  end if;
  -- Assert the actual student-facing aggregate, not merely the row count.
  select coalesce(sum(done_minutes),0) into v_count
    from public.booking_meetings where booking_id=v_id;
  if v_count<>225 then
    raise exception 'Student-visible completed minutes mismatch: expected 225, got %',v_count;
  end if;
  -- The student-facing balance RPC must reflect 225/240 delivered minutes.
  -- This is a separate contract from raw meeting-row visibility.
  select public.booking_balance_minutes(v_id) into v_count;
  if v_count is distinct from 15 then
    raise exception 'Student balance RPC expected 15 remaining minutes, got %',v_count;
  end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',true);
  execute 'set local role authenticated';
  select coalesce(sum(done_minutes),0) into v_count
    from public.booking_meetings where booking_id=v_id;
  if v_count<>0 then raise exception 'IDOR: other student reads completed minutes'; end if;
  select public.booking_balance_minutes(v_id) into v_count;
  if v_count is not null then
    raise exception 'IDOR: another student reads booking balance via RPC';
  end if;
  execute 'reset role';
  -- Re-check the unrelated instructor AFTER both progress records exist.
  -- Pre-lesson RLS checks alone do not prove that notes and actual minutes
  -- remain private after the instructor has completed both encounters.
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',true);
  execute 'set local role authenticated';
  select count(*) into v_count from public.booking_meetings
    where booking_id=v_id and (done_minutes>0 or note is not null);
  if v_count<>0 then
    raise exception 'IDOR: unrelated instructor reads completed lesson progress';
  end if;
  -- Completed progress must remain immutable to non-assigned actors, not
  -- merely hidden by SELECT policies. Test direct writes after completion.
  begin
    update public.booking_meetings
       set done_minutes=0, note='forged post-lesson update'
     where id=v_m1;
    get diagnostics v_count = row_count;
    if v_count<>0 then
      raise exception 'SECURITY: unrelated instructor changed completed progress';
    end if;
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
  execute 'set local role authenticated';
  begin
    update public.booking_meetings
       set done_minutes=0, note='forged student post-lesson update'
     where id=v_m2;
    get diagnostics v_count = row_count;
    if v_count<>0 then
      raise exception 'SECURITY: student changed completed instructor progress';
    end if;
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  -- Verify both original records survived unauthorized write attempts.
  if not exists (select 1 from public.booking_meetings
    where id=v_m1 and done_minutes=110 and note='Controle e segurança: janela de vento')
    or not exists (select 1 from public.booking_meetings
    where id=v_m2 and done_minutes=115 and note='Water start e primeiros bordos') then
    raise exception 'SECURITY: post-lesson write changed persisted evolution';
  end if;
  raise notice 'PASS: student and unrelated instructor cannot modify completed progress';
  raise notice 'PASS: 4h booking confirmed, instructor recorded 2 encounters, student reads 225 completed minutes and progress';
  raise notice 'PASS: RLS isolates both meetings; server price snapshot matches 4h';
  raise notice 'PASS: authenticated student booking 4h in two days persisted as 2x120 minutes';
end $$;
SQL
