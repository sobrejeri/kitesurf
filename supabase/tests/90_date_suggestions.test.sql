-- Alternative dates: only offered instructor suggests, only student accepts.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',uid,false); execute 'set role authenticated'; end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub','',false); end $$;

do $$
declare req uuid; offer uuid; target uuid; proposed jsonb; bid uuid;
  start_time timestamptz;
begin
  select r.id into req from public.instructor_requests r
    where r.student_id='00000000-0000-0000-0000-0000000000b1'
      and r.preferred_instructor_id='00000000-0000-0000-0000-0000000000a1'
      and r.status='searching'
    order by r.created_at desc limit 1;
  select o.id,o.instructor_id into offer,target from public.instructor_offers o
    where o.request_id=req and o.status='offered' limit 1;
  assert offer is not null and target='00000000-0000-0000-0000-0000000000a1',
    'fixture preferred instructor offered';
  start_time:=(((now() at time zone 'America/Fortaleza')::date+39)::timestamp
    +interval '14 hours') at time zone 'America/Fortaleza';
  proposed:=jsonb_build_array(jsonb_build_object('starts_at',start_time,'hours',1));

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
  begin
    perform public.suggest_instructor_dates(offer,proposed);
    raise exception 'different instructor suggested dates';
  exception when no_data_found then null; end;
  perform pg_temp.reset();

  perform pg_temp.act_as(target::text);
  begin
    perform public.suggest_instructor_dates(offer,
      jsonb_build_array(jsonb_build_object('starts_at',start_time,'hours',2)));
    raise exception 'teacher increased hours on suggestion';
  exception when invalid_parameter_value then null; end;
  perform public.suggest_instructor_dates(offer,proposed);
  perform pg_temp.reset();
  assert (select status from public.instructor_offers where id=offer)='suggested',
    'proposal waits for student';
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
  begin
    perform public.respond_to_offer_suggestion(offer,true);
    raise exception 'different student accepted suggestion';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
  assert (public.read_my_offer_suggestion(req)->>'id')=offer::text,
    'student sees proposed meeting';
  perform public.respond_to_offer_suggestion(offer,true);
  perform pg_temp.reset();
  assert (select status from public.instructor_offers where id=offer)='offered',
    'accepted proposal returns to instructor for final acceptance';
  assert (select meetings from public.instructor_requests where id=req)=proposed,
    'requested dates update only with student consent';

  perform pg_temp.act_as(target::text);
  bid:=public.accept_instructor_offer(offer);
  perform pg_temp.reset();
  assert bid is not null, 'teacher can accept student-approved new date';
  assert (select starts_at from public.booking_meetings where booking_id=bid limit 1)=start_time,
    'booking uses student-approved date';
end $$;
