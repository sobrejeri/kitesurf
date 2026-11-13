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
  if (select count(*) from public.booking_meetings where booking_id=v_id)<>2 then
    raise exception 'Expected exactly two meetings'; end if;
  if (select sum(minutes) from public.booking_meetings where booking_id=v_id)<>240 then
    raise exception 'Expected exactly 240 scheduled minutes'; end if;
  if (select count(distinct (starts_at at time zone 'America/Fortaleza')::date)
      from public.booking_meetings where booking_id=v_id)<>2 then
    raise exception 'Expected meetings on two distinct local days'; end if;
  raise notice 'PASS: authenticated student booking 4h in two days persisted as 2x120 minutes';
end $$;
SQL
