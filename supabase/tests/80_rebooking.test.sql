-- Rebooking must prove a previous paid lesson and try that instructor first.
\set ON_ERROR_STOP on
-- A separate student is required: the checkout test has already confirmed
-- a booking for b2, so that account may legitimately rehire this teacher.
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES (
  '00000000-0000-0000-0000-000000000b80','new-rebooking@test','{"full_name":"New student"}'
);
create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',uid,false); execute 'set role authenticated'; end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub','',false); end $$;

do $$
declare
  req uuid; preferred uuid := '00000000-0000-0000-0000-0000000000a1';
  requested_at timestamptz;
  offer_to uuid;
  payload jsonb;
begin
  assert exists(select 1 from public.bookings
    where student_id='00000000-0000-0000-0000-0000000000b1'
      and instructor_id=preferred and status in ('confirmed','completed')),
    'fixture student has completed or confirmed class with preferred teacher';
  requested_at:=(((now() at time zone 'America/Fortaleza')::date+32)::timestamp
    +interval '14 hours') at time zone 'America/Fortaleza';
  payload:=jsonb_build_array(jsonb_build_object('starts_at',requested_at,'hours',1));

  perform pg_temp.act_as('00000000-0000-0000-0000-000000000b80');
  begin
    perform public.create_instructor_request_with_preference(
      (select id from public.beaches where slug='prea'),'first_time','Português',
      payload,null,false,preferred);
    raise exception 'unverified customer chose another student instructor';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
  req:=public.create_instructor_request_with_preference(
    (select id from public.beaches where slug='prea'),'first_time','Português',
    payload,null,false,preferred);
  perform pg_temp.reset();
  assert (select preferred_instructor_id from public.instructor_requests where id=req)=preferred,
    'request keeps previous instructor choice';
  select instructor_id into offer_to from public.instructor_offers where request_id=req and status='offered';
  assert offer_to=preferred,'preferred instructor is first in line';
end $$;
