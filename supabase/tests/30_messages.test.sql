-- Test participant-only conversations after confirmed payment.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',uid,false); execute 'set role authenticated'; end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub','',false); end $$;

do $$
declare bid uuid; message_id uuid;
begin
  select id into bid from public.bookings where code='VNT-1001';
  assert bid is not null and (select status from public.bookings where id=bid)='confirmed',
     'fixture must be a paid booking';
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
  message_id:=public.send_booking_message(bid,'Bom dia, instrutor!');
  assert (select count(*) from public.booking_messages where booking_id=bid)=1, 'student sees sent message';
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
  assert (select count(*) from public.booking_messages where booking_id=bid)=1, 'instructor sees student message';
  perform public.send_booking_message(bid,'Bom dia, combinado!');
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
  assert (select count(*) from public.booking_messages where booking_id=bid)=0, 'other student cannot see messages';
  begin
    perform public.send_booking_message(bid,'Tentativa indevida');
    raise exception 'unrelated student sent a message';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  -- Pending payments never open a chat.
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
  begin
    perform public.send_booking_message((select id from public.bookings
      where student_id=auth.uid() and status='awaiting_payment' limit 1),'Olá');
    raise exception 'pending booking opened a chat';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();
end $$;
