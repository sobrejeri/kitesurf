-- Phase 4 integration tests: 2-minute offers, queue continuation and payment gating.
\set ON_ERROR_STOP on

create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',uid,false);
 execute 'set role authenticated';
end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin
 execute 'reset role';
 perform set_config('request.jwt.claim.sub','',false);
end $$;

-- First create a proposal as the student, not a payable booking.
do $$
declare req_id uuid; offer_id uuid; first_instructor uuid; next_offer uuid;
  second_instructor uuid; booking_id uuid; start_time timestamptz;
  d integer; meeting_plan jsonb;
begin
  start_time:=(((now() at time zone 'America/Fortaleza')::date+32)::timestamp
            +interval '10 hours') at time zone 'America/Fortaleza';
  meeting_plan:=jsonb_build_array(jsonb_build_object('starts_at',start_time,'hours',2));

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
  req_id:=public.create_instructor_request((select id from public.beaches where slug='prea'),
    'first_time','Português',meeting_plan,'mar-e-vento',false);
  assert (select count(*) from public.instructor_requests where id=req_id)=1,
    'student can read own request';
  assert (select status from public.instructor_requests where id=req_id)='searching',
    'request must wait before payment';
  perform pg_temp.reset();

  assert not exists(select 1 from public.bookings b where b.id=
    (select booking_id from public.instructor_requests where id=req_id)),
    'no payable booking before instructor accepts';
  select id,instructor_id into offer_id,first_instructor from public.instructor_offers
    where request_id=req_id and status='offered';
  assert offer_id is not null,'first offer must be created';

  -- Another student cannot inspect request or answer an instructor offer.
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
  assert (select count(*) from public.instructor_requests where id=req_id)=0,
    'unrelated student sees no requests';
  begin
    perform public.accept_instructor_offer(offer_id);
    raise exception 'student accepted another instructor offer';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  perform pg_temp.act_as(first_instructor::text);
  perform public.decline_instructor_offer(offer_id);
  perform pg_temp.reset();
  assert (select status from public.instructor_offers where id=offer_id)='declined',
    'offer must show decline';
  select id,instructor_id into next_offer,second_instructor from public.instructor_offers
    where request_id=req_id and status='offered';
  assert next_offer is not null, 'decline moves to next eligible instructor';
  assert second_instructor <> first_instructor,'different instructor after decline';

  perform pg_temp.act_as(second_instructor::text);
  booking_id:=public.accept_instructor_offer(next_offer);
  perform pg_temp.reset();

  assert booking_id is not null, 'accept must create a booking';
  assert (select status from public.instructor_requests where id=req_id)='accepted',
    'request becomes accepted';
  assert (select instructor_id from public.bookings where id=booking_id)=second_instructor,
    'accepted booking belongs to accepting instructor';
  assert (select status from public.bookings where id=booking_id)='awaiting_payment',
    'booking waits for payment only after acceptance';
  assert (select partner_cents from public.bookings where id=booking_id)=0,
    'repeat student gets no second inn commission';

  -- Student can access the accepted request and pay their booking.
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
  assert (select booking_id from public.instructor_requests where id=req_id)=booking_id,
    'student sees payment destination';
  assert public.simulate_test_payment(booking_id,'pix','approved')='approved',
    'paying an accepted request works';
  perform pg_temp.reset();
  assert (select status from public.bookings where id=booking_id)='confirmed',
    'accepted booking can be paid';

  -- Two overlapping meetings must never enter the offer workflow.
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
  begin
    perform public.create_instructor_request((select id from public.beaches where slug='prea'),
     'first_time','Português',jsonb_build_array(
       jsonb_build_object('starts_at',start_time+interval '4 days','hours',3),
       jsonb_build_object('starts_at',start_time+interval '4 days 1 hour','hours',1)));
    raise exception 'overlapping requested sessions accepted';
  exception when invalid_parameter_value then null; end;
  perform pg_temp.reset();
end $$;
