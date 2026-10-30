-- Vento — server-side operations.
--
-- Every state change a client can ask for goes through one of these
-- functions. They run as SECURITY DEFINER with an empty search_path, check the
-- caller's role AND their relationship to the row, and derive every amount
-- themselves. None of them accepts a price, a total or a commission.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.require_role(allowed public.app_role[]) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r public.app_role;
begin
  if uid is null then
    raise exception 'Sign in required' using errcode = '28000';
  end if;
  select role into r from public.profiles where id = uid;
  if r is null or not (r = any (allowed) or r = 'admin') then
    raise exception 'Not allowed for role %', coalesce(r::text, 'none') using errcode = '42501';
  end if;
  return uid;
end;
$$;

create function public.write_audit(
  p_action text, p_entity text, p_entity_id text,
  p_previous jsonb, p_new jsonb, p_reason text default null
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_id, action, entity, entity_id, previous_state, new_state, reason)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_previous, p_new, p_reason);
$$;

create function public.current_price_version() returns public.price_versions
language sql stable security definer set search_path = '' as $$
  select * from public.price_versions order by id desc limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Pricing
-- ---------------------------------------------------------------------------

-- The "2h × R$ 300/hora = R$ 600" line on the home page. Public: the hourly
-- rate is not a secret, and computing it here keeps the browser from doing so.
create function public.quote_preview(p_hours integer)
returns table (hours integer, hourly_rate_cents integer, total_cents integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.price_versions := public.current_price_version();
begin
  if p_hours is null or p_hours < 1 or p_hours > 8 then
    raise exception 'Hours must be between 1 and 8' using errcode = '22023';
  end if;
  if v.id is null then
    raise exception 'No price published' using errcode = 'P0002';
  end if;
  return query select p_hours, v.hourly_rate_cents, p_hours * v.hourly_rate_cents;
end;
$$;

-- The same preview for every bookable duration, for the hours stepper.
create function public.quote_table()
returns table (hours integer, hourly_rate_cents integer, total_cents integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.price_versions := public.current_price_version();
begin
  if v.id is null then
    raise exception 'No price published' using errcode = 'P0002';
  end if;
  return query select h, v.hourly_rate_cents, h * v.hourly_rate_cents from generate_series(1, 8) as h;
end;
$$;

-- Splits a total. The commission is derived once; the instructor's net is the
-- remainder, so the three parts always add up to the total to the centavo.
create function public.split_total(p_total integer, p_platform_bps integer, p_partner_bps integer)
returns table (partner_cents integer, platform_cents integer, instructor_net_cents integer)
language plpgsql immutable set search_path = '' as $$
declare
  commission integer := (p_total::bigint * p_platform_bps / 10000)::integer;
  partner integer := least((p_total::bigint * coalesce(p_partner_bps, 0) / 10000)::integer, commission);
begin
  return query select partner, commission - partner, p_total - commission;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------

-- p_meetings: [{ "starts_at": "2026-11-02T09:00:00-03:00", "hours": 2 }, ...]
create function public.create_booking(
  p_beach public.beach,
  p_level public.lesson_level,
  p_language text,
  p_meetings jsonb,
  p_partner_code text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_role(array['student']::public.app_role[]);
  price public.price_versions := public.current_price_version();
  meeting jsonb;
  total_hours integer := 0;
  meeting_count integer;
  partner public.partners;
  chosen_instructor uuid;
  split record;
  booking_id uuid;
  booking_code text;
  pos integer := 0;
begin
  if price.id is null then
    raise exception 'No price published' using errcode = 'P0002';
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

  if p_partner_code is not null and p_partner_code <> '' then
    select * into partner from public.partners
    where code = upper(p_partner_code) and status = 'approved';
  end if;

  -- The first approved, compatible instructor in queue order with no
  -- overlapping meeting on any of the requested slots.
  select i.id into chosen_instructor
  from public.instructors i
  where i.status = 'approved'
    and p_beach = any (i.beaches)
    and p_language = any (i.languages)
    and i.id <> uid
    and not exists (
      select 1
      from jsonb_array_elements(p_meetings) m
      join public.booking_meetings bm on true
      join public.bookings b on b.id = bm.booking_id
      where b.instructor_id = i.id
        and b.status in ('awaiting_payment', 'confirmed')
        and bm.status <> 'cancelled'
        and tstzrange(bm.starts_at, bm.starts_at + make_interval(mins => bm.minutes))
            && tstzrange((m ->> 'starts_at')::timestamptz,
                         (m ->> 'starts_at')::timestamptz + make_interval(hours => (m ->> 'hours')::integer))
    )
  order by i.queue_position
  limit 1;

  if chosen_instructor is null then
    raise exception 'No instructor available for these slots' using errcode = 'P0001', hint = 'NO_INSTRUCTOR';
  end if;

  select * into split from public.split_total(
    total_hours * price.hourly_rate_cents, price.platform_commission_bps, partner.commission_bps);

  booking_code := 'VNT-' || nextval('public.booking_code_seq');

  insert into public.bookings (
    code, student_id, instructor_id, partner_id, price_version_id, beach, level, language,
    total_hours, hourly_rate_cents, total_cents, partner_cents, platform_cents, instructor_net_cents,
    presence_code
  ) values (
    booking_code, uid, chosen_instructor, partner.id, price.id, p_beach, p_level, p_language,
    total_hours, price.hourly_rate_cents, total_hours * price.hourly_rate_cents,
    split.partner_cents, split.platform_cents, split.instructor_net_cents,
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
    jsonb_build_object('code', booking_code, 'instructor_id', chosen_instructor,
      'total_cents', total_hours * price.hourly_rate_cents, 'price_version_id', price.id));

  return booking_id;
end;
$$;

-- TEST PAYMENT. Stands in for the gateway webhook until a payment provider is
-- integrated: it confirms the booking without moving any money. Only the
-- student who owns the booking can call it.
create function public.confirm_test_payment(p_booking_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_role(array['student']::public.app_role[]);
  b public.bookings;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if b.id is null or b.student_id <> uid then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if b.status <> 'awaiting_payment' then
    raise exception 'Booking is not awaiting payment' using errcode = '55000';
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

create function public.start_meeting(p_meeting_id uuid, p_presence_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_role(array['instructor']::public.app_role[]);
  m public.booking_meetings;
  b public.bookings;
begin
  select * into m from public.booking_meetings where id = p_meeting_id for update;
  select * into b from public.bookings where id = m.booking_id;
  -- Assigned instructor only. An admin does not start lessons on anyone's behalf.
  if m.id is null or b.instructor_id is distinct from uid then
    raise exception 'Meeting not found' using errcode = 'P0002';
  end if;
  if b.status <> 'confirmed' or m.status <> 'scheduled' then
    raise exception 'Meeting cannot be started' using errcode = '55000';
  end if;
  if p_presence_code is distinct from b.presence_code then
    raise exception 'Presence code does not match' using errcode = '22023';
  end if;
  update public.booking_meetings set status = 'in_progress', started_at = now() where id = m.id;
end;
$$;

create function public.record_meeting(p_meeting_id uuid, p_done_minutes integer, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_role(array['instructor']::public.app_role[]);
  m public.booking_meetings;
  b public.bookings;
begin
  select * into m from public.booking_meetings where id = p_meeting_id for update;
  select * into b from public.bookings where id = m.booking_id;
  if m.id is null or b.instructor_id is distinct from uid then
    raise exception 'Meeting not found' using errcode = 'P0002';
  end if;
  if m.status <> 'in_progress' then
    raise exception 'Start the meeting with the presence code first' using errcode = '55000';
  end if;
  if p_done_minutes is null or p_done_minutes < 0 or p_done_minutes > m.minutes then
    raise exception 'Done minutes must be between 0 and %', m.minutes using errcode = '22023';
  end if;

  update public.booking_meetings
  set status = 'done', done_minutes = p_done_minutes, note = left(p_note, 1000), recorded_at = now()
  where id = m.id;

  if not exists (
    select 1 from public.booking_meetings where booking_id = b.id and status in ('scheduled', 'in_progress')
  ) then
    update public.bookings set status = 'completed' where id = b.id;
  end if;

  perform public.write_audit('meeting.recorded', 'booking_meeting', m.id::text,
    jsonb_build_object('status', m.status), jsonb_build_object('done_minutes', p_done_minutes));
end;
$$;

-- ---------------------------------------------------------------------------
-- Administration
-- ---------------------------------------------------------------------------

create function public.publish_price_version(p_hourly_rate_cents integer, p_commission_bps integer, p_reason text)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_role(array['admin']::public.app_role[]);
  previous public.price_versions := public.current_price_version();
  new_id bigint;
begin
  if p_reason is null or char_length(trim(p_reason)) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  insert into public.price_versions (hourly_rate_cents, platform_commission_bps, created_by, reason)
  values (p_hourly_rate_cents, p_commission_bps, uid, p_reason)
  returning id into new_id;

  perform public.write_audit('price.published', 'price_version', new_id::text,
    to_jsonb(previous), jsonb_build_object('hourly_rate_cents', p_hourly_rate_cents,
      'platform_commission_bps', p_commission_bps), p_reason);
  return new_id;
end;
$$;

-- New instructors join at the end of the queue.
create function public.set_instructor_status(p_instructor_id uuid, p_status public.instructor_status, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  i public.instructors;
begin
  perform public.require_role(array['admin']::public.app_role[]);
  select * into i from public.instructors where id = p_instructor_id for update;
  if i.id is null then
    raise exception 'Instructor not found' using errcode = 'P0002';
  end if;

  update public.instructors set
    status = p_status,
    approved_at = coalesce(approved_at, case when p_status = 'approved' then now() end),
    -- First approval takes a place at the end; pausing and resuming keep it.
    queue_position = coalesce(queue_position,
      case when p_status = 'approved' then nextval('public.instructor_queue_seq') end)
  where id = i.id;

  perform public.write_audit('instructor.status_changed', 'instructor', i.id::text,
    jsonb_build_object('status', i.status), jsonb_build_object('status', p_status), p_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- Partner inns
-- ---------------------------------------------------------------------------

create function public.register_partner(p_name text, p_beach public.beach) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_role(array['partner']::public.app_role[]);
  base text := upper(regexp_replace(left(coalesce(p_name, ''), 20), '[^A-Za-z0-9]+', '-', 'g'));
  new_id uuid;
begin
  base := trim(both '-' from base);
  if char_length(base) < 3 then
    base := 'POUSADA';
  end if;
  insert into public.partners (owner_id, name, code, beach)
  values (uid, p_name, base || '-' || lpad((floor(random() * 1000))::integer::text, 3, '0'), p_beach)
  returning id into new_id;
  return new_id;
end;
$$;

create function public.set_partner_status(p_partner_id uuid, p_status public.partner_status, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.partners;
begin
  perform public.require_role(array['admin']::public.app_role[]);
  select * into p from public.partners where id = p_partner_id for update;
  if p.id is null then
    raise exception 'Partner not found' using errcode = 'P0002';
  end if;
  update public.partners set status = p_status where id = p.id;
  perform public.write_audit('partner.status_changed', 'partner', p.id::text,
    jsonb_build_object('status', p.status), jsonb_build_object('status', p_status), p_reason);
end;
$$;

-- What a partner may know about its referrals: counts and its own commission,
-- never who the guests are.
create function public.partner_summary()
returns table (bookings integer, pending_cents bigint, released_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := public.require_role(array['partner']::public.app_role[]);
begin
  return query
  select count(*)::integer,
         coalesce(sum(b.partner_cents) filter (where b.status in ('awaiting_payment', 'confirmed')), 0),
         coalesce(sum(b.partner_cents) filter (where b.status = 'completed'), 0)
  from public.bookings b
  join public.partners p on p.id = b.partner_id
  where p.owner_id = uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: functions are callable only by the roles that need them.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.quote_preview(integer) to anon, authenticated;
grant execute on function public.quote_table() to anon, authenticated;
grant execute on function public.create_booking(public.beach, public.lesson_level, text, jsonb, text) to authenticated;
grant execute on function public.confirm_test_payment(uuid) to authenticated;
grant execute on function public.start_meeting(uuid, text) to authenticated;
grant execute on function public.record_meeting(uuid, integer, text) to authenticated;
grant execute on function public.publish_price_version(integer, integer, text) to authenticated;
grant execute on function public.set_instructor_status(uuid, public.instructor_status, text) to authenticated;
grant execute on function public.register_partner(text, public.beach) to authenticated;
grant execute on function public.set_partner_status(uuid, public.partner_status, text) to authenticated;
grant execute on function public.partner_summary() to authenticated;
-- Used inside RLS policies, so the calling role must be able to execute them.
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.current_app_role() to authenticated;

-- ---------------------------------------------------------------------------
-- Initial price: R$ 300/hora, 15% commission (the sketch's example values).
-- ---------------------------------------------------------------------------

insert into public.price_versions (hourly_rate_cents, platform_commission_bps, reason)
values (30000, 1500, 'Valor inicial do protótipo');
