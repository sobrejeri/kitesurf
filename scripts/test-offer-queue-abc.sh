#!/usr/bin/env bash
# Disposable PostgreSQL only: three approved test instructors, A declines,
# B expires, C accepts; no production scheduler or real payments.
set -euo pipefail
: "${PG_TEST_SOCKET:?Disposable database socket required}"
: "${PG_TEST_PORT:?Disposable database port required}"
psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
-- Create the third fictional instructor in the throwaway DB.
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000a4','queue-third@test.invalid',
 '{"full_name":"Instrutor Fictício C","role":"instructor"}');
do $$
begin
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',true);
  execute 'set local role authenticated';
  update public.instructors set languages=array['Português'] where id=auth.uid();
  perform public.set_my_beaches(array(select id from public.beaches where slug='prea'));
  perform public.set_my_tax_id('52998224725');
  execute 'reset role';
end $$;
insert into public.instructor_documents(instructor_id,kind,storage_path,original_name,status)
select '00000000-0000-0000-0000-0000000000a4'::uuid,k.kind,
 'queue-test/'||k.kind||'.pdf',k.kind||'.pdf','approved'
from (values ('identity'),('certification')) k(kind);
do $$
begin
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',true);
  execute 'set local role authenticated';
  perform public.set_instructor_status('00000000-0000-0000-0000-0000000000a4','approved','Fixture descartável');
  execute 'reset role';
end $$;

do $$
declare
  v_beach uuid;
  v_st timestamptz;
  v_meetings jsonb;
  v_req uuid;
  v_offer uuid;
  v_a uuid;
  v_b uuid;
  v_c uuid;
  v_booking uuid;
  v_count integer;
begin
  select id into strict v_beach from public.beaches where slug='prea';
  -- Find a common free slot rather than assuming a weekday is available.
  with slots as (
    select (date_trunc('day',now() at time zone 'America/Fortaleza')
       +make_interval(days=>d,hours=>h)) at time zone 'America/Fortaleza' st
    from generate_series(3,20) d cross join generate_series(8,15) h
  )
  select st into v_st from slots
  where public.instructor_can_attend('00000000-0000-0000-0000-0000000000a1',
      jsonb_build_array(jsonb_build_object('starts_at',st,'hours',2)))
    and public.instructor_can_attend('00000000-0000-0000-0000-0000000000a2',
      jsonb_build_array(jsonb_build_object('starts_at',st,'hours',2)))
    and public.instructor_can_attend('00000000-0000-0000-0000-0000000000a4',
      jsonb_build_array(jsonb_build_object('starts_at',st,'hours',2)))
  order by st limit 1;
  if v_st is null then raise exception 'Fixture: no common eligible slot for three instructors'; end if;
  v_meetings:=jsonb_build_array(jsonb_build_object('starts_at',v_st,'hours',2));
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
  execute 'set local role authenticated';
  v_req:=public.create_instructor_request(v_beach,'first_time','Português',v_meetings);
  execute 'reset role';
  select id,instructor_id into strict v_offer,v_a from public.instructor_offers
    where request_id=v_req and status='offered';
  perform set_config('request.jwt.claim.sub',v_a::text,true);
  execute 'set local role authenticated';
  perform public.decline_instructor_offer(v_offer);
  execute 'reset role';
  if (select status from public.instructor_offers where id=v_offer)<>'declined' then
    raise exception 'A decline not persisted'; end if;
  select id,instructor_id into strict v_offer,v_b from public.instructor_offers
    where request_id=v_req and status='offered';
  if v_b=v_a then raise exception 'A was offered twice after decline'; end if;
  -- Move the *fictional* B offer expiry back in disposable PostgreSQL.
  update public.instructor_offers set expires_at=now()-interval '1 second'
    where id=v_offer;
  perform public.advance_instructor_offer(v_req);
  if (select status from public.instructor_offers where id=v_offer)<>'expired' then
    raise exception 'B expiry not persisted'; end if;
  select id,instructor_id into strict v_offer,v_c from public.instructor_offers
    where request_id=v_req and status='offered';
  if v_c in (v_a,v_b) then raise exception 'A/B reoffered after expiry'; end if;
  perform set_config('request.jwt.claim.sub',v_c::text,true);
  execute 'set local role authenticated';
  v_booking:=public.accept_instructor_offer(v_offer);
  execute 'reset role';
  if v_booking is null then raise exception 'C acceptance returned no booking'; end if;
  if not exists(select 1 from public.bookings where id=v_booking
    and instructor_id=v_c and student_id='00000000-0000-0000-0000-0000000000b2')
    then raise exception 'C acceptance booking owner/instructor mismatch'; end if;
  if (select status from public.instructor_requests where id=v_req)<>'accepted' then
    raise exception 'Request not accepted'; end if;
  select count(*) into v_count from public.instructor_offers where request_id=v_req;
  if v_count<>3 then raise exception 'Expected exactly A/B/C offers, got %',v_count; end if;
  perform public.advance_instructor_offer(v_req);
  if (select count(*) from public.instructor_offers where request_id=v_req)<>3 then
    raise exception 'Non-idempotent advancement after acceptance'; end if;
  raise notice 'PASS: A declined, B expired, C accepted; exactly 3 offers and 1 booking';
end $$;
SQL
