-- Stage 3: do not award an inn a commission after the customer's first paid booking.
-- Legacy bookings keep immutable snapshots. Old overlapping pending affiliate
-- claims are rejected at test payment instead of silently double-paying.
begin;
create or replace function public.create_booking(
  p_beach_id uuid,
  p_level public.lesson_level,
  p_language text,
  p_meetings jsonb,
  p_partner_code text default null,
  p_with_transport boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_role(array['student']::public.app_role[]);
  price public.price_versions := public.current_price_version();
  with_transport boolean := coalesce(p_with_transport, false);
  meeting jsonb;
  total_hours integer := 0;
  meeting_count integer;
  partner public.partners;
  chosen_instructor uuid;
  split record;
  lesson_cents integer;
  v_transport_cents integer;
  booking_id uuid;
  booking_code text;
  pos integer := 0;
begin
  if price.id is null then
    raise exception 'No price published' using errcode = 'P0002';
  end if;
  if with_transport and price.transport_hourly_cents <= 0 then
    raise exception 'Support vehicle not available' using errcode = '22023';
  end if;
  if not exists (select 1 from public.beaches where id = p_beach_id and active) then
    raise exception 'Unknown or inactive beach' using errcode = '22023';
  end if;
  if p_language is null or char_length(p_language) > 40 then
    raise exception 'Invalid language' using errcode = '22023';
  end if;
  if jsonb_typeof(p_meetings) <> 'array' then
    raise exception 'Meetings must be a list' using errcode = '22023';
  end if;
  meeting_count := jsonb_array_length(p_meetings);
  if meeting_count < 1 or meeting_count > 8 then
    raise exception 'Between 1 and 8 meetings' using errcode = '22023';
  end if;

  for meeting in select * from jsonb_array_elements(p_meetings) loop
    if (meeting ->> 'hours')::integer not between 1 and 8 then
      raise exception 'Each meeting lasts 1 to 8 hours' using errcode = '22023';
    end if;
    if (meeting ->> 'starts_at')::timestamptz < now() + interval '1 hour' then
      raise exception 'Meetings must start at least one hour from now' using errcode = '22023';
    end if;
    total_hours := total_hours + (meeting ->> 'hours')::integer;
  end loop;
  if total_hours > 8 then
    raise exception 'At most 8 hours per booking' using errcode = '22023';
  end if;

  -- Close holds older than ten minutes; preserve booking history.
  update public.bookings set status='cancelled', cancelled_at=now()
  where status='awaiting_payment' and created_at < now()-interval '10 minutes';

  if exists (
    select 1 from jsonb_array_elements(p_meetings) with ordinality a(m,n)
    join jsonb_array_elements(p_meetings) with ordinality b(m,n) on a.n<b.n
    where tstzrange((a.m->>'starts_at')::timestamptz,
      (a.m->>'starts_at')::timestamptz+make_interval(hours=>(a.m->>'hours')::integer),'[)')
       && tstzrange((b.m->>'starts_at')::timestamptz,
      (b.m->>'starts_at')::timestamptz+make_interval(hours=>(b.m->>'hours')::integer),'[)')
  ) then raise exception 'Overlapping meetings' using errcode='22023'; end if;

  if p_partner_code is not null and p_partner_code <> '' then
    select * into partner from public.partners
    where code = upper(p_partner_code) and status = 'approved';
  end if;

  -- Affiliate attribution belongs exclusively to the student's FIRST paid
  -- contract, irrespective of the referral link used for subsequent orders.
  if exists (select 1 from public.bookings paid
     where paid.student_id=uid and paid.status in ('confirmed','completed')) then
    partner := null;
  end if;

  select i.id into chosen_instructor
  from public.instructors i
  where i.status = 'approved'
    and exists (select 1 from public.instructor_beaches ib where ib.instructor_id = i.id and ib.beach_id = p_beach_id)
    and p_language = any (i.languages)
    and (not with_transport or i.has_support_vehicle)
    and i.id <> uid
    and public.instructor_can_attend(i.id,p_meetings)
    and not exists (
      select 1
      from jsonb_array_elements(p_meetings) m
      join public.booking_meetings bm on true
      join public.bookings b on b.id = bm.booking_id
      where b.instructor_id = i.id
        and (b.status='confirmed' or
          (b.status='awaiting_payment' and b.created_at >= now()-interval '10 minutes'))
        and bm.status <> 'cancelled'
        and tstzrange(bm.starts_at, bm.starts_at + make_interval(mins => bm.minutes))
            && tstzrange((m ->> 'starts_at')::timestamptz,
                         (m ->> 'starts_at')::timestamptz + make_interval(hours => (m ->> 'hours')::integer))
    )
  order by i.queue_position
  limit 1
  for update of i skip locked;

  if chosen_instructor is null then
    raise exception 'No instructor available for these slots' using errcode = 'P0001', hint = 'NO_INSTRUCTOR';
  end if;

  lesson_cents := total_hours * price.hourly_rate_cents;
  v_transport_cents := case when with_transport then total_hours * price.transport_hourly_cents else 0 end;
  -- Commissions are taken from the lesson only; transport is the instructor's.
  select * into split from public.split_total(lesson_cents, price.platform_commission_bps, partner.commission_bps);

  booking_code := 'VNT-' || nextval('public.booking_code_seq');

  insert into public.bookings (
    code, student_id, instructor_id, partner_id, price_version_id, beach_id, level, language,
    total_hours, hourly_rate_cents, with_transport, transport_hourly_cents, transport_cents,
    total_cents, partner_cents, platform_cents, instructor_net_cents, presence_code
  ) values (
    booking_code, uid, chosen_instructor, partner.id, price.id, p_beach_id, p_level, p_language,
    total_hours, price.hourly_rate_cents, with_transport,
    case when with_transport then price.transport_hourly_cents else 0 end, v_transport_cents,
    lesson_cents + v_transport_cents, split.partner_cents, split.platform_cents,
    split.instructor_net_cents + v_transport_cents,
    lpad((floor(random() * 10000))::integer::text, 4, '0')
  ) returning id into booking_id;

  for meeting in
    select value from jsonb_array_elements(p_meetings) order by (value ->> 'starts_at')::timestamptz
  loop
    pos := pos + 1;
    insert into public.booking_meetings (booking_id, position, starts_at, minutes)
    values (booking_id, pos, (meeting ->> 'starts_at')::timestamptz, (meeting ->> 'hours')::integer * 60);
  end loop;

  perform public.write_audit('booking.created', 'booking', booking_id::text, null,
    jsonb_build_object('code', booking_code, 'instructor_id', chosen_instructor, 'beach_id', p_beach_id,
      'with_transport', with_transport, 'total_cents', lesson_cents + v_transport_cents,
      'price_version_id', price.id));

  return booking_id;
end;
$$;
create or replace function public.confirm_test_payment(p_booking_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_role(array['student']::public.app_role[]);
  b public.bookings;
begin
  -- Serialize payment attempts by customer to prevent double affiliate claims,
  -- including when two pending bookings were created in parallel.
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
    raise exception 'First paid booking already exists; please request a new booking without affiliate commission'
      using errcode='55000';
  end if;
  update public.bookings set status = 'confirmed', confirmed_at = now() where id = b.id;
  -- The instructor's turn is used: back to the end of the queue.
  update public.instructors set queue_position = nextval('public.instructor_queue_seq')
  where id = b.instructor_id;

  perform public.write_audit('booking.payment_confirmed_test', 'booking', b.id::text,
    jsonb_build_object('status', b.status), jsonb_build_object('status', 'confirmed'),
    'Test payment — no money moved');
end;
$$;
commit;
