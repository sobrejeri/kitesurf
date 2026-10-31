-- Vento — support vehicle as an optional add-on.
--
-- The student can ask for a support vehicle with the lesson. The vehicle is
-- the instructor's own: only instructors who declare one are matched, and the
-- transport amount goes to the instructor in full — no platform commission
-- and no partner-inn commission on it. It is priced per lesson hour at a rate
-- the admin publishes with the lesson price, and has no schedule of its own.
--
-- Impact: adds columns with defaults (no existing value changes), replaces
-- one CHECK so a booking total may include transport, and recreates three
-- functions whose signatures change. Existing bookings have no transport, so
-- every one of them still satisfies the new check.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

-- Price versions are immutable rows; the existing ones get R$ 100/h (the
-- sketch's example) so transport is offered right away. New versions must
-- state the rate explicitly.
alter table public.price_versions
  add column transport_hourly_cents integer not null default 10000 check (transport_hourly_cents between 0 and 1000000);
alter table public.price_versions alter column transport_hourly_cents drop default;

alter table public.instructors add column has_support_vehicle boolean not null default false;
grant update (has_support_vehicle) on public.instructors to authenticated;

alter table public.bookings
  add column with_transport boolean not null default false,
  add column transport_hourly_cents integer not null default 0 check (transport_hourly_cents >= 0),
  add column transport_cents integer not null default 0 check (transport_cents >= 0);

-- The total is lesson plus transport; the split still adds up to the total.
alter table public.bookings drop constraint bookings_total_matches_rate;
alter table public.bookings add constraint bookings_total_matches_rate
  check (total_cents = total_hours * hourly_rate_cents + transport_cents);
alter table public.bookings add constraint bookings_transport_matches_rate
  check (transport_cents = case when with_transport then total_hours * transport_hourly_cents else 0 end);

-- The transport amounts join the frozen financial snapshot.
create or replace function public.bookings_snapshot_frozen() returns trigger
language plpgsql as $$
begin
  if (new.code, new.student_id, new.price_version_id, new.partner_id, new.total_hours,
      new.hourly_rate_cents, new.total_cents, new.partner_cents, new.platform_cents,
      new.instructor_net_cents, new.created_at,
      new.with_transport, new.transport_hourly_cents, new.transport_cents)
     is distinct from
     (old.code, old.student_id, old.price_version_id, old.partner_id, old.total_hours,
      old.hourly_rate_cents, old.total_cents, old.partner_cents, old.platform_cents,
      old.instructor_net_cents, old.created_at,
      old.with_transport, old.transport_hourly_cents, old.transport_cents) then
    raise exception 'The financial snapshot of booking % is frozen; issue a refund instead', old.code
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Prices
-- ---------------------------------------------------------------------------

-- Every bookable duration with and without transport, computed here so the
-- browser only looks the numbers up.
drop function public.quote_table();
create function public.quote_table()
returns table (
  hours integer,
  hourly_rate_cents integer,
  total_cents integer,
  transport_hourly_cents integer,
  transport_cents integer,
  total_with_transport_cents integer
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.price_versions := public.current_price_version();
begin
  if v.id is null then
    raise exception 'No price published' using errcode = 'P0002';
  end if;
  return query
  select h, v.hourly_rate_cents, h * v.hourly_rate_cents,
         v.transport_hourly_cents, h * v.transport_hourly_cents,
         h * v.hourly_rate_cents + h * v.transport_hourly_cents
  from generate_series(1, 8) as h;
end;
$$;

drop function public.publish_price_version(integer, integer, text);
create function public.publish_price_version(
  p_hourly_rate_cents integer,
  p_commission_bps integer,
  p_transport_hourly_cents integer,
  p_reason text
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_role(array['admin']::public.app_role[]);
  previous public.price_versions := public.current_price_version();
  new_id bigint;
begin
  if p_reason is null or char_length(trim(p_reason)) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  insert into public.price_versions (hourly_rate_cents, platform_commission_bps, transport_hourly_cents, created_by, reason)
  values (p_hourly_rate_cents, p_commission_bps, p_transport_hourly_cents, uid, p_reason)
  returning id into new_id;

  perform public.write_audit('price.published', 'price_version', new_id::text,
    to_jsonb(previous), jsonb_build_object('hourly_rate_cents', p_hourly_rate_cents,
      'platform_commission_bps', p_commission_bps, 'transport_hourly_cents', p_transport_hourly_cents), p_reason);
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------

drop function public.create_booking(uuid, public.lesson_level, text, jsonb, text);

-- Same rules as before, plus: with transport, only instructors who declare a
-- support vehicle are matched, and the transport amount is added to the
-- total and to the instructor's net. Commissions apply to the lesson only.
-- p_meetings: [{ "starts_at": "2026-11-02T09:00:00-03:00", "hours": 2 }, ...]
create function public.create_booking(
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

  if p_partner_code is not null and p_partner_code <> '' then
    select * into partner from public.partners
    where code = upper(p_partner_code) and status = 'approved';
  end if;

  select i.id into chosen_instructor
  from public.instructors i
  where i.status = 'approved'
    and exists (select 1 from public.instructor_beaches ib where ib.instructor_id = i.id and ib.beach_id = p_beach_id)
    and p_language = any (i.languages)
    and (not with_transport or i.has_support_vehicle)
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

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function public.quote_table() from public;
revoke execute on function public.publish_price_version(integer, integer, integer, text) from public, anon;
revoke execute on function public.create_booking(uuid, public.lesson_level, text, jsonb, text, boolean) from public, anon;

grant execute on function public.quote_table() to anon, authenticated;
grant execute on function public.publish_price_version(integer, integer, integer, text) to authenticated;
grant execute on function public.create_booking(uuid, public.lesson_level, text, jsonb, text, boolean) to authenticated;
