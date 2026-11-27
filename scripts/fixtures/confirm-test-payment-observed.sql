-- TEST FIXTURE ONLY. Captured function source via SELECT on 2026-11-27.
-- Never apply this vulnerable baseline to a hosted project. Used only in a disposable cluster.
CREATE OR REPLACE FUNCTION public.confirm_test_payment(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := public.require_role(array['student']::public.app_role[]);
  b public.bookings;
begin
  perform 1 from public.profiles where id=uid for update;
  select * into b from public.bookings where id = p_booking_id for update;

  if b.id is null or b.student_id <> uid then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if b.status <> 'awaiting_payment' then
    raise exception 'Booking is not awaiting payment' using errcode = '55000';
  end if;
  if b.created_at < now()-interval '10 minutes' then
    raise exception 'Payment window expired' using errcode='55000';
  end if;
  if b.partner_cents > 0 and exists (
    select 1 from public.bookings paid
    where paid.student_id=uid and paid.id<>b.id
      and paid.status in ('confirmed','completed')
  ) then
    raise exception
      'First paid booking already exists; please request a new booking without affiliate commission'
      using errcode='55000';
  end if;

  update public.bookings
    set status = 'confirmed', confirmed_at = now()
    where id = b.id;

  update public.instructors
    set queue_position = nextval('public.instructor_queue_seq')
    where id = b.instructor_id;

  perform public.write_audit(
    'booking.payment_confirmed_test',
    'booking',
    b.id::text,
    jsonb_build_object('status', b.status),
    jsonb_build_object('status', 'confirmed'),
    'Test payment — no money moved'
  );
end;
$function$
;
