#!/usr/bin/env bash
# Disposable PostgreSQL only: authenticated meeting change validation.
set -euo pipefail
: "${PG_TEST_SOCKET:?}"
: "${PG_TEST_PORT:?}"
psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare
 v_beach uuid; v_old timestamptz; v_new timestamptz;
 v_booking uuid; v_meeting uuid; v_change uuid;
 v_soon timestamptz; v_soon_booking uuid; v_soon_meeting uuid;
begin
 select id into strict v_beach from public.beaches where slug='jeri';
 with slots as (
   select (date_trunc('day',now() at time zone 'America/Fortaleza')
     +make_interval(days=>d,hours=>h)) at time zone 'America/Fortaleza' st,
     d from generate_series(5,25) d cross join generate_series(8,15) h
 ), eligible as (
   select st,d from slots where public.instructor_can_attend(
     '00000000-0000-0000-0000-0000000000a1',
     jsonb_build_array(jsonb_build_object('starts_at',st,'hours',2)))
 )
 select a.st,b.st into v_old,v_new from eligible a join eligible b on b.d>=a.d+2
 order by a.st,b.st limit 1;
 if v_old is null or v_new is null then
   raise exception 'No eligible future dates for meeting-change fixture'; end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
 execute 'set local role authenticated';
 v_booking:=public.create_booking(v_beach,'first_time','Português',
   jsonb_build_array(jsonb_build_object('starts_at',v_old,'hours',2)));
 perform public.confirm_test_payment(v_booking);
 execute 'reset role';
 select id into strict v_meeting from public.booking_meetings where booking_id=v_booking;
 -- Separate near-term lesson: changing within 72 hours must be rejected.
 with slots as (
   select (date_trunc('day',now() at time zone 'America/Fortaleza')
     +make_interval(days=>d,hours=>h)) at time zone 'America/Fortaleza' st
   from generate_series(1,2) d cross join generate_series(8,15) h
 )
 select st into v_soon from slots
 where st>now()+interval '2 hours' and st<now()+interval '72 hours'
   and public.instructor_can_attend('00000000-0000-0000-0000-0000000000a1',
     jsonb_build_array(jsonb_build_object('starts_at',st,'hours',1)))
 order by st limit 1;
 if v_soon is null then raise exception 'Fixture: no available lesson within 72 hours'; end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
 execute 'set local role authenticated';
 v_soon_booking:=public.create_booking(v_beach,'first_time','Português',
   jsonb_build_array(jsonb_build_object('starts_at',v_soon,'hours',1)));
 perform public.confirm_test_payment(v_soon_booking);
 execute 'reset role';
 select id into strict v_soon_meeting from public.booking_meetings where booking_id=v_soon_booking;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
 execute 'set local role authenticated';
 begin
   perform public.request_meeting_change(v_soon_meeting,v_soon+interval '5 days',
     'Safety reason for postponement');
   raise exception 'SECURITY: meeting changed with less than 72h notice';
 exception when invalid_parameter_value then null; end;
 execute 'reset role';
 if exists(select 1 from public.meeting_change_requests where meeting_id=v_soon_meeting) then
   raise exception 'Invalid 72h change request persisted'; end if;
 -- A different student cannot request a change.
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',true);
 execute 'set local role authenticated';
 begin
   perform public.request_meeting_change(v_meeting,v_new,'Other student attempt');
   raise exception 'SECURITY: unrelated student changed another booking';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
 execute 'set local role authenticated';
 begin
   perform public.request_meeting_change(v_meeting,v_old-interval '1 day','Earlier date attempt');
   raise exception 'SECURITY: booking date moved earlier';
 exception when invalid_parameter_value then null; end;
 v_change:=public.request_meeting_change(v_meeting,v_new,'Wind forecast and safety adjustment');
 execute 'reset role';
 if not exists(select 1 from public.meeting_change_requests
   where id=v_change and status='pending' and proposed_starts_at=v_new) then
   raise exception 'Change request missing'; end if;
 -- A different instructor cannot approve it.
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',true);
 execute 'set local role authenticated';
 begin
   perform public.respond_meeting_change(v_change,true);
   raise exception 'SECURITY: unrelated instructor accepted change';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
 execute 'set local role authenticated';
 perform public.respond_meeting_change(v_change,true);
 execute 'reset role';
 if not exists(select 1 from public.booking_meetings
   where id=v_meeting and starts_at=v_new and minutes=120) then
   raise exception 'Accepted meeting change did not preserve lesson duration'; end if;
 if not exists(select 1 from public.bookings
   where id=v_booking and status='confirmed' and total_hours=2) then
   raise exception 'Rescheduling changed sale or contracted hours'; end if;
 if (select status from public.meeting_change_requests where id=v_change)<>'accepted' then
   raise exception 'Change status not accepted'; end if;
 raise notice 'PASS: authorized postponement; no earlier date or cross-account approval; booking preserved';
end $$;
SQL
