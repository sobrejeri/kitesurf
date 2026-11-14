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
 v_choice timestamptz; v_visible integer;

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
 -- Move only the disposable fixture's meeting inside the 72-hour window.
 -- Restore the original future date before the authorized postponement flow.
 update public.booking_meetings set starts_at=now()+interval '48 hours' where id=v_meeting;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
 execute 'set local role authenticated';
 begin
   perform public.request_meeting_change(v_meeting,v_new,
     'Safety reason for postponement');
   raise exception 'SECURITY: meeting changed with less than 72h notice';
 exception when invalid_parameter_value then null; end;
 execute 'reset role';
 if exists(select 1 from public.meeting_change_requests where meeting_id=v_meeting) then
   raise exception 'Invalid 72h change request persisted'; end if;
 update public.booking_meetings set starts_at=v_old where id=v_meeting;
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
 -- An accepted postponement must update the existing meeting, never add
 -- a second lesson or consume extra contracted hours.
 if (select count(*) from public.booking_meetings where booking_id=v_booking)<>1 then
   raise exception 'Accepted postponement duplicated or removed the booked meeting'; end if;
 if (select coalesce(sum(minutes),0) from public.booking_meetings where booking_id=v_booking)<>120 then
   raise exception 'Accepted postponement changed the purchased meeting minutes'; end if;
 -- Simulate an unanswered 12-hour request in disposable PostgreSQL only.
 -- Expiry opens the student's choice window but must not cancel the sale.
 insert into public.meeting_change_requests(
   booking_id,meeting_id,requester_id,responder_id,
   original_starts_at,proposed_starts_at,reason,expires_at
 ) values (
   v_booking,v_meeting,'00000000-0000-0000-0000-0000000000b2',
   '00000000-0000-0000-0000-0000000000a1',
   v_new,v_new+interval '3 days','Unanswered safety postponement',
   now()-interval '1 minute'
 ) returning id into v_change;
 perform public.expire_meeting_change_requests();
 if not exists(select 1 from public.meeting_change_requests
   where id=v_change and status='expired' and choice_expires_at>now()+interval '11 hours'
     and choice_expires_at<=now()+interval '12 hours 1 minute') then
   raise exception 'Expired change did not open the 12-hour student choice window'; end if;
 if not exists(select 1 from public.bookings where id=v_booking
   and status='confirmed' and instructor_id='00000000-0000-0000-0000-0000000000a1') then
   raise exception 'Expired change unexpectedly reassigned or cancelled booking'; end if;
 -- An expired proposal must not silently move or consume the purchased lesson.
 if not exists(select 1 from public.booking_meetings
   where id=v_meeting and booking_id=v_booking and starts_at=v_new
     and minutes=120) then
   raise exception 'Expired change modified meeting date, owner or purchased minutes'; end if;
 if (select count(*) from public.booking_meetings where booking_id=v_booking)<>1 then
   raise exception 'Expired change duplicated or removed a booked meeting'; end if;
 -- Retried expiry jobs must not extend the decision deadline or change the sale.
 select choice_expires_at into strict v_choice
   from public.meeting_change_requests where id=v_change;
 perform public.expire_meeting_change_requests();
 if (select choice_expires_at from public.meeting_change_requests where id=v_change)
    is distinct from v_choice then
   raise exception 'Expiry retry extended or altered student choice deadline'; end if;
 if (select status from public.meeting_change_requests where id=v_change)<>'expired' then
   raise exception 'Expiry retry changed terminal request status'; end if;
 -- Accepted change history must remain visible to its student owner,
 -- and invisible to a different student even after the meeting date moves.
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
 execute 'set local role authenticated';
 select count(*) into v_visible from public.meeting_change_requests
   where booking_id=v_booking and status='accepted';
 if v_visible<>1 then raise exception 'Booking owner cannot read accepted change'; end if;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',true);
 execute 'set local role authenticated';
 select count(*) into v_visible from public.meeting_change_requests
   where booking_id=v_booking and status='accepted';
 if v_visible<>0 then raise exception 'IDOR: other student can read accepted change'; end if;
 execute 'reset role';
 -- After approval, the authorized instructor and student may inspect the
 -- decision, while an unrelated instructor must not read the request via RLS.
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
 execute 'set local role authenticated';
 select count(*) into v_visible from public.meeting_change_requests
   where id in (select id from public.meeting_change_requests
     where booking_id=v_booking and status='accepted');
 if v_visible<>1 then raise exception 'Assigned instructor cannot read accepted change'; end if;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',true);
 execute 'set local role authenticated';
 select count(*) into v_visible from public.meeting_change_requests
   where booking_id=v_booking and status='accepted';
 if v_visible<>0 then raise exception 'IDOR: unrelated instructor can read accepted change'; end if;
 execute 'reset role';
 -- The student owning the booking may read their decision deadline, but a
 -- different authenticated student must not discover it through RLS.
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
 execute 'set local role authenticated';
 select count(*) into v_visible from public.meeting_change_requests where id=v_change;
 if v_visible<>1 then raise exception 'Owner cannot read expired choice'; end if;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',true);
 execute 'set local role authenticated';
 select count(*) into v_visible from public.meeting_change_requests where id=v_change;
 if v_visible<>0 then raise exception 'IDOR: other student can read expired choice'; end if;
 execute 'reset role';
 raise notice 'PASS: authorized postponement and 12h expiry choice window preserve confirmed booking';
end $$;
-- Independently verify the core 4-hour purchase shape: two distinct 2-hour
-- meetings, one confirmed booking, and no accidental duplication of minutes.
do $$
declare
 v_beach uuid; v_first timestamptz; v_second timestamptz;
 v_booking uuid;
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
 select a.st,b.st into v_first,v_second from eligible a
 join eligible b on b.d>=a.d+2
 where public.instructor_can_attend(
   '00000000-0000-0000-0000-0000000000a1',
   jsonb_build_array(jsonb_build_object('starts_at',a.st,'hours',2),
                           jsonb_build_object('starts_at',b.st,'hours',2)))
 order by a.st,b.st limit 1;
 if v_first is null or v_second is null then
   raise exception 'No eligible 4h/2-meeting fixture dates'; end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
 execute 'set local role authenticated';
 v_booking:=public.create_booking(v_beach,'first_time','Português',
   jsonb_build_array(jsonb_build_object('starts_at',v_first,'hours',2),
                     jsonb_build_object('starts_at',v_second,'hours',2)));
 perform public.confirm_test_payment(v_booking);
 execute 'reset role';
 if not exists(select 1 from public.bookings
   where id=v_booking and status='confirmed' and total_hours=4) then
   raise exception '4h booking not confirmed with correct contracted hours'; end if;
 if (select count(*) from public.booking_meetings where booking_id=v_booking)<>2 then
   raise exception '4h booking did not preserve exactly two meetings'; end if;
 if (select coalesce(sum(minutes),0) from public.booking_meetings
     where booking_id=v_booking)<>240 then
   raise exception '4h booking did not preserve 240 purchased minutes'; end if;
 if not exists(select 1 from public.booking_meetings
   where booking_id=v_booking and starts_at=v_first and minutes=120)
 or not exists(select 1 from public.booking_meetings
   where booking_id=v_booking and starts_at=v_second and minutes=120) then
   raise exception '4h booking changed one of the two scheduled meeting slots'; end if;
 -- The authenticated booking owner must see both purchased meetings,
 -- while an unrelated student cannot inspect either meeting or the booking.
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
 execute 'set local role authenticated';
 if (select count(*) from public.bookings where id=v_booking)<>1 then
   raise exception 'Student owner cannot read confirmed 4h booking'; end if;
 if (select count(*) from public.booking_meetings where booking_id=v_booking)<>2 then
   raise exception 'Student owner cannot read both purchased meetings'; end if;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',true);
 execute 'set local role authenticated';
 if exists(select 1 from public.bookings where id=v_booking) then
   raise exception 'IDOR: unrelated student can read 4h booking'; end if;
 if exists(select 1 from public.booking_meetings where booking_id=v_booking) then
   raise exception 'IDOR: unrelated student can read 4h meetings'; end if;
 execute 'reset role';
 raise notice 'PASS: confirmed 4h booking has two 120-minute meetings';
end $$;
SQL
