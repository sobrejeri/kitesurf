-- Vento — beaches managed by the operation.
--
-- Until now the beaches were an enum fixed in code (Preá, Jericoacoara). They
-- become rows the admin creates, renames and deactivates. Instructors pick
-- every beach they can teach at (one or many), students pick from the active
-- ones, and matching only offers instructors who serve the chosen beach.
--
-- Impact: this converts three columns that hold the enum —
-- instructors.beaches, partners.beach and bookings.beach — into references to
-- the new table, copying every existing value first, then drops the old
-- columns and the enum. Nothing is lost: each enum value becomes a beaches
-- row with the same slug, and every row is mapped to it before the drop. The
-- whole file runs in one transaction, so a failure leaves the schema as it was.

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

create table public.beaches (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null unique check (char_length(name) between 2 and 60),
  region text not null default '' check (char_length(region) <= 60),
  -- Inactive beaches stay on existing bookings but are no longer offered.
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.beaches (slug, name, region) values
  ('prea', 'Preá', 'Ceará'),
  ('jeri', 'Jericoacoara', 'Ceará');

-- Which instructor teaches at which beach. A join table rather than an array
-- so every pair is a real foreign key.
create table public.instructor_beaches (
  instructor_id uuid not null references public.instructors (id) on delete cascade,
  beach_id uuid not null references public.beaches (id) on delete restrict,
  primary key (instructor_id, beach_id)
);

create index instructor_beaches_beach_idx on public.instructor_beaches (beach_id);

-- ---------------------------------------------------------------------------
-- Move existing data off the enum
-- ---------------------------------------------------------------------------

insert into public.instructor_beaches (instructor_id, beach_id)
select i.id, b.id
from public.instructors i
cross join lateral unnest(i.beaches) as e(value)
join public.beaches b on b.slug = e.value::text
on conflict do nothing;

alter table public.partners add column beach_id uuid references public.beaches (id);
update public.partners p set beach_id = b.id from public.beaches b where b.slug = p.beach::text;
alter table public.partners alter column beach_id set not null;

alter table public.bookings add column beach_id uuid references public.beaches (id);
update public.bookings bk set beach_id = b.id from public.beaches b where b.slug = bk.beach::text;
alter table public.bookings alter column beach_id set not null;

-- The column grant names `beaches`, so it is re-issued without it below.
revoke update on public.instructors from authenticated;

-- Functions whose signatures use the enum go before the type itself.
drop function public.create_booking(public.beach, public.lesson_level, text, jsonb, text);
drop function public.register_partner(text, public.beach);

alter table public.instructors drop column beaches;
alter table public.partners drop column beach;
alter table public.bookings drop column beach;
drop type public.beach;

grant update (years_experience, languages, has_equipment) on public.instructors to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.beaches enable row level security;
alter table public.instructor_beaches enable row level security;

revoke all on public.beaches, public.instructor_beaches from anon, authenticated;
grant select on public.beaches to anon, authenticated;
grant select on public.instructor_beaches to authenticated;

-- Visitors see the active beaches the explore page offers. Signed-in users
-- see every beach, so a booking at a since-deactivated beach still shows its
-- name; the pickers filter on `active` themselves.
create policy beaches_select_anon on public.beaches for select to anon using (active);
create policy beaches_select_authenticated on public.beaches for select to authenticated using (true);

-- Which beaches an instructor serves: visible wherever the instructor is.
create policy instructor_beaches_select on public.instructor_beaches for select to authenticated using (
  exists (
    select 1 from public.instructors i
    where i.id = instructor_beaches.instructor_id
      and (i.status = 'approved' or i.id = auth.uid() or public.is_admin())
  )
);

-- ---------------------------------------------------------------------------
-- Beach administration
-- ---------------------------------------------------------------------------

create function public.create_beach(p_name text, p_region text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  clean_name text := trim(coalesce(p_name, ''));
  base text;
  candidate text;
  n integer := 1;
  new_id uuid;
begin
  perform public.require_role(array['admin']::public.app_role[]);
  if char_length(clean_name) < 2 or char_length(clean_name) > 60 then
    raise exception 'Beach name must have 2 to 60 characters' using errcode = '22023';
  end if;

  -- A readable, unique slug: "Praia do Preá" → "praia-do-prea".
  base := trim(both '-' from regexp_replace(
    translate(lower(clean_name), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]+', '-', 'g'));
  if char_length(base) < 2 then
    base := 'praia';
  end if;
  base := left(base, 36);
  candidate := base;
  while exists (select 1 from public.beaches where slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;

  insert into public.beaches (slug, name, region)
  values (candidate, clean_name, left(trim(coalesce(p_region, '')), 60))
  returning id into new_id;

  perform public.write_audit('beach.created', 'beach', new_id::text, null,
    jsonb_build_object('name', clean_name, 'region', p_region));
  return new_id;
end;
$$;

create function public.update_beach(p_beach_id uuid, p_name text, p_region text, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  b public.beaches;
  clean_name text := trim(coalesce(p_name, ''));
begin
  perform public.require_role(array['admin']::public.app_role[]);
  select * into b from public.beaches where id = p_beach_id for update;
  if b.id is null then
    raise exception 'Beach not found' using errcode = 'P0002';
  end if;
  if char_length(clean_name) < 2 or char_length(clean_name) > 60 then
    raise exception 'Beach name must have 2 to 60 characters' using errcode = '22023';
  end if;

  update public.beaches
  set name = clean_name, region = left(trim(coalesce(p_region, '')), 60), active = coalesce(p_active, active)
  where id = b.id;

  perform public.write_audit('beach.updated', 'beach', b.id::text,
    jsonb_build_object('name', b.name, 'region', b.region, 'active', b.active),
    jsonb_build_object('name', clean_name, 'region', p_region, 'active', p_active));
end;
$$;

-- An instructor's own list, replaced as a whole. Only active beaches can be
-- added; an inactive one already on the list may stay.
create function public.set_my_beaches(p_beach_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_role(array['instructor']::public.app_role[]);
begin
  if not exists (select 1 from public.instructors where id = uid) then
    raise exception 'Instructor not found' using errcode = 'P0002';
  end if;
  if coalesce(array_length(p_beach_ids, 1), 0) > 20 then
    raise exception 'Too many beaches' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_beach_ids, '{}')) as chosen(id)
    left join public.beaches b on b.id = chosen.id
    where b.id is null
       or (not b.active and not exists (
         select 1 from public.instructor_beaches ib where ib.instructor_id = uid and ib.beach_id = b.id))
  ) then
    raise exception 'Unknown or inactive beach' using errcode = '22023';
  end if;

  delete from public.instructor_beaches where instructor_id = uid;
  insert into public.instructor_beaches (instructor_id, beach_id)
  select distinct uid, id from unnest(coalesce(p_beach_ids, '{}')) as chosen(id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Bookings and partners, now by beach id
-- ---------------------------------------------------------------------------

-- Same rules as before; the beach must exist and be active, and the
-- instructor must list it.
-- p_meetings: [{ "starts_at": "2026-11-02T09:00:00-03:00", "hours": 2 }, ...]
create function public.create_booking(
  p_beach_id uuid,
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

  -- The first approved instructor in queue order who serves this beach,
  -- speaks the language and is free on every requested slot.
  select i.id into chosen_instructor
  from public.instructors i
  where i.status = 'approved'
    and exists (select 1 from public.instructor_beaches ib where ib.instructor_id = i.id and ib.beach_id = p_beach_id)
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
    code, student_id, instructor_id, partner_id, price_version_id, beach_id, level, language,
    total_hours, hourly_rate_cents, total_cents, partner_cents, platform_cents, instructor_net_cents,
    presence_code
  ) values (
    booking_code, uid, chosen_instructor, partner.id, price.id, p_beach_id, p_level, p_language,
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
    jsonb_build_object('code', booking_code, 'instructor_id', chosen_instructor, 'beach_id', p_beach_id,
      'total_cents', total_hours * price.hourly_rate_cents, 'price_version_id', price.id));

  return booking_id;
end;
$$;

create function public.register_partner(p_name text, p_beach_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_role(array['partner']::public.app_role[]);
  base text := upper(regexp_replace(left(coalesce(p_name, ''), 20), '[^A-Za-z0-9]+', '-', 'g'));
  new_id uuid;
begin
  if not exists (select 1 from public.beaches where id = p_beach_id and active) then
    raise exception 'Unknown or inactive beach' using errcode = '22023';
  end if;
  base := trim(both '-' from base);
  if char_length(base) < 3 then
    base := 'POUSADA';
  end if;
  insert into public.partners (owner_id, name, code, beach_id)
  values (uid, p_name, base || '-' || lpad((floor(random() * 1000))::integer::text, 3, '0'), p_beach_id)
  returning id into new_id;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function public.create_beach(text, text) from public, anon;
revoke execute on function public.update_beach(uuid, text, text, boolean) from public, anon;
revoke execute on function public.set_my_beaches(uuid[]) from public, anon;
revoke execute on function public.create_booking(uuid, public.lesson_level, text, jsonb, text) from public, anon;
revoke execute on function public.register_partner(text, uuid) from public, anon;

grant execute on function public.create_beach(text, text) to authenticated;
grant execute on function public.update_beach(uuid, text, text, boolean) to authenticated;
grant execute on function public.set_my_beaches(uuid[]) to authenticated;
grant execute on function public.create_booking(uuid, public.lesson_level, text, jsonb, text) to authenticated;
grant execute on function public.register_partner(text, uuid) to authenticated;
