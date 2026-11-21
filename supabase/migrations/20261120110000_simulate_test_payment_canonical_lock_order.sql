-- Follow-up to 20261120100000: prevent simulate_test_payment from acquiring
-- booking FOR UPDATE before confirm_test_payment acquires instructor -> profile -> booking.
-- Only simulated payments; no real gateway or money movement.
begin;
create or replace function public.simulate_test_payment(
  p_booking_id uuid, p_method text, p_outcome text
) returns text
language plpgsql security definer set search_path = '' as $function$
declare
  uid uuid := public.require_role(array['student']::public.app_role[]);
  b public.bookings;
begin
  if p_method not in ('pix','card') or p_outcome not in ('approved','pending','declined')
     or p_method is null or p_outcome is null then
    raise exception 'Invalid test payment parameters' using errcode='22023';
  end if;

  if p_outcome = 'approved' then
    -- This function obtains instructor -> profile -> booking locks and validates
    -- student ownership, payment window and current booking state atomically.
    -- Do NOT lock bookings in this caller before invoking it.
    perform public.confirm_test_payment(p_booking_id);
  else
    -- No instructor queue mutation for pending/declined attempts.
    select * into b from public.bookings where id=p_booking_id for update;
    if b.id is null or b.student_id<>uid then
      raise exception 'Booking not found' using errcode='P0002';
    end if;
    if b.status<>'awaiting_payment' or b.created_at<now()-interval '10 minutes' then
      raise exception 'Payment window expired or booking no longer payable' using errcode='55000';
    end if;
  end if;

  insert into public.test_payment_attempts(booking_id,student_id,method,outcome)
    values(p_booking_id,uid,p_method,p_outcome);
  perform public.write_audit('booking.payment_simulated','booking',p_booking_id::text,null,
    jsonb_build_object('method',p_method,'outcome',p_outcome),'Simulated payment only');
  return p_outcome;
end $function$;
notify pgrst, 'reload schema';
commit;
