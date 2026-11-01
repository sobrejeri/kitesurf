-- Post-lesson ratings: authorship, one review per booking and instructor-only inbox.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',uid,false); execute 'set role authenticated'; end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub','',false); end $$;

do $$
declare rid uuid; bid uuid;
begin
  select id into bid from public.bookings where code='VNT-1001';
  assert bid is not null, 'fixture booking exists';

  -- A booking with remaining meetings cannot be evaluated early.
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
  begin
    perform public.rate_completed_booking(bid,5,'Excelente!');
    raise exception 'early review accepted';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  update public.bookings set status='completed' where id=bid;
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
  begin
    perform public.rate_completed_booking(bid,1,'Tentativa indevida');
    raise exception 'unrelated student reviewed a class';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
  rid:=public.rate_completed_booking(bid,5,'Professor excelente.');
  assert rid is not null, 'review saved';
  begin
    perform public.rate_completed_booking(bid,1,'Segunda avaliação');
    raise exception 'second review accepted';
  exception when unique_violation then null; end;
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
  assert (select count(*) from public.instructor_ratings where booking_id=bid)=1,
    'assigned instructor can read verified review';
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
  assert (select count(*) from public.instructor_ratings where booking_id=bid)=0,
    'another instructor cannot read private review';
  perform pg_temp.reset();
end $$;
