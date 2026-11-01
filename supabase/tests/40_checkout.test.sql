-- Test checkout simulator: only the student pays their pending booking.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',uid,false); execute 'set role authenticated'; end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub','',false); end $$;

do $$
declare bid uuid;
begin
  select id into bid from public.bookings
    where student_id='00000000-0000-0000-0000-0000000000b2'
      and status='awaiting_payment' limit 1;
  assert bid is not null, 'need pending booking fixture';

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
  begin
    perform public.simulate_test_payment(bid,'pix','approved');
    raise exception 'unrelated student paid booking';
  exception when no_data_found then null; end;
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
  assert public.simulate_test_payment(bid,'pix','pending')='pending','pending simulation';
  assert public.simulate_test_payment(bid,'card','declined')='declined','declined simulation';
  assert (select status from public.bookings where id=bid)='awaiting_payment','unpaid remains pending';
  assert public.simulate_test_payment(bid,'card','approved')='approved','approved simulation';
  assert (select status from public.bookings where id=bid)='confirmed','approved updates booking';
  assert (select count(*) from public.test_payment_attempts where booking_id=bid)=3,
    'audit each attempt';
  perform pg_temp.reset();
end $$;
