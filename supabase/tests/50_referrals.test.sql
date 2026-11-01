-- Inn commissions belong only to the first paid booking per customer.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',uid,false); execute 'set role authenticated'; end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub','',false); end $$;

do $$
declare v_id uuid; b public.bookings;
begin
  assert (select count(*) from public.bookings
    where student_id='00000000-0000-0000-0000-0000000000b1'
      and partner_cents>0 and status in ('confirmed','completed'))=1,
    'fixture must already have one paid referred booking';

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
  v_id:=public.create_booking((select id from public.beaches where slug='prea'),
    'first_time','Português',jsonb_build_array(
      jsonb_build_object('starts_at',(now()+interval '45 days')::text,'hours',1)
    ),'mar-e-vento');
  perform pg_temp.reset();

  select * into b from public.bookings where id=v_id;
  assert b.partner_id is null, 'repeat customer must not be attributed to inn';
  assert b.partner_cents=0, 'repeat customer must have no inn commission';
  assert b.platform_cents>0 and b.instructor_net_cents>0,
    'commission must be retained by platform without changing instructor share';
end $$;
