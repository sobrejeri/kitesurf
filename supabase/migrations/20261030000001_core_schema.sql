-- Vento — core schema.
--
-- Profiles, instructors, partner inns, versioned prices, bookings with their
-- meetings, and an append-only audit log. Every table has row level security.
-- Clients never write bookings, prices or queue positions directly: those
-- change only through the SECURITY DEFINER functions in the next migration,
-- which derive every amount on the server.

create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('student', 'instructor', 'admin', 'partner');
create type public.instructor_status as enum ('pending', 'approved', 'paused');
create type public.partner_status as enum ('pending', 'approved');
create type public.beach as enum ('prea', 'jeri');
create type public.lesson_level as enum ('first_time', 'returning', 'improving');
create type public.booking_status as enum ('awaiting_payment', 'confirmed', 'cancelled', 'completed');
create type public.meeting_status as enum ('scheduled', 'in_progress', 'done', 'cancelled');

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'student',
  full_name text not null default '' check (char_length(full_name) <= 120),
  language text not null default 'Português' check (char_length(language) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.instructors (
  id uuid primary key references public.profiles (id) on delete cascade,
  status public.instructor_status not null default 'pending',
  years_experience smallint not null default 0 check (years_experience between 0 and 60),
  beaches public.beach[] not null default '{}',
  languages text[] not null default '{Português}',
  has_equipment boolean not null default false,
  -- Lower is earlier. Taken from a sequence on approval and again after each
  -- confirmed payment, which is what sends an instructor to the end of the
  -- queue. Declining or letting an offer expire never touches it.
  queue_position bigint,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create sequence public.instructor_queue_seq;
create index instructors_queue_idx on public.instructors (queue_position) where status = 'approved';

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  code text not null unique check (code ~ '^[A-Z0-9-]{3,32}$'),
  beach public.beach not null,
  -- Basis points of the lesson total (500 = 5%). Paid out of the platform's
  -- commission, never added to the student's price or taken from the instructor.
  commission_bps integer not null default 500 check (commission_bps between 0 and 5000),
  status public.partner_status not null default 'pending',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Prices
-- ---------------------------------------------------------------------------

-- A price change is a new row. Rows are immutable, and every booking keeps the
-- id of the version it was priced with.
create table public.price_versions (
  id bigserial primary key,
  hourly_rate_cents integer not null check (hourly_rate_cents between 1000 and 1000000),
  platform_commission_bps integer not null check (platform_commission_bps between 0 and 10000),
  created_by uuid references public.profiles (id),
  reason text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------

create sequence public.booking_code_seq start 1001;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  student_id uuid not null references public.profiles (id),
  instructor_id uuid references public.instructors (id),
  partner_id uuid references public.partners (id),
  price_version_id bigint not null references public.price_versions (id),
  status public.booking_status not null default 'awaiting_payment',
  beach public.beach not null,
  level public.lesson_level not null,
  language text not null,
  total_hours smallint not null check (total_hours between 1 and 8),

  -- Financial snapshot, frozen at creation (see bookings_snapshot_frozen).
  hourly_rate_cents integer not null check (hourly_rate_cents > 0),
  total_cents integer not null check (total_cents > 0),
  partner_cents integer not null default 0 check (partner_cents >= 0),
  platform_cents integer not null check (platform_cents >= 0),
  instructor_net_cents integer not null check (instructor_net_cents >= 0),

  presence_code text not null check (presence_code ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,

  constraint bookings_split_reconciles
    check (partner_cents + platform_cents + instructor_net_cents = total_cents),
  constraint bookings_total_matches_rate
    check (total_cents = total_hours * hourly_rate_cents)
);

create index bookings_student_idx on public.bookings (student_id, created_at desc);
create index bookings_instructor_idx on public.bookings (instructor_id, created_at desc);
create index bookings_partner_idx on public.bookings (partner_id) where partner_id is not null;

create table public.booking_meetings (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  position smallint not null check (position between 1 and 8),
  starts_at timestamptz not null,
  minutes smallint not null check (minutes between 60 and 480 and minutes % 60 = 0),
  status public.meeting_status not null default 'scheduled',
  done_minutes smallint not null default 0,
  note text check (char_length(note) <= 1000),
  started_at timestamptz,
  recorded_at timestamptz,
  unique (booking_id, position),
  constraint booking_meetings_done_within_scheduled check (done_minutes between 0 and minutes)
);

create index booking_meetings_time_idx on public.booking_meetings (starts_at);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text not null,
  previous_state jsonb,
  new_state jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs (entity, entity_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

create function public.reject_change() returns trigger
language plpgsql as $$
begin
  raise exception '% on % is not allowed', tg_op, tg_table_name using errcode = 'insufficient_privilege';
end;
$$;

-- Even the service role cannot rewrite these: a log that can be edited is not
-- evidence, and a price that can be edited silently changes old bookings.
create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function public.reject_change();
create trigger price_versions_immutable before update or delete on public.price_versions
  for each row execute function public.reject_change();

create function public.bookings_snapshot_frozen() returns trigger
language plpgsql as $$
begin
  if (new.code, new.student_id, new.price_version_id, new.partner_id, new.total_hours,
      new.hourly_rate_cents, new.total_cents, new.partner_cents, new.platform_cents,
      new.instructor_net_cents, new.created_at)
     is distinct from
     (old.code, old.student_id, old.price_version_id, old.partner_id, old.total_hours,
      old.hourly_rate_cents, old.total_cents, old.partner_cents, old.platform_cents,
      old.instructor_net_cents, old.created_at) then
    raise exception 'The financial snapshot of booking % is frozen; issue a refund instead', old.code
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger bookings_snapshot_frozen before update on public.bookings
  for each row execute function public.bookings_snapshot_frozen();

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- New users
-- ---------------------------------------------------------------------------

-- Sign-up may ask to be a student, an instructor or a partner inn. Admin is
-- never self-assigned: it is granted by an existing admin (or by SQL for the
-- very first one). Instructors start pending and outside the queue.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  requested text := new.raw_user_meta_data ->> 'role';
  chosen public.app_role := case
    when requested in ('instructor', 'partner') then requested::public.app_role
    else 'student'::public.app_role
  end;
begin
  insert into public.profiles (id, role, full_name)
  values (new.id, chosen, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120));

  if chosen = 'instructor' then
    insert into public.instructors (id) values (new.id);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER so policies can use them without recursion)
-- ---------------------------------------------------------------------------

create function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid();
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.instructors enable row level security;
alter table public.partners enable row level security;
alter table public.price_versions enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_meetings enable row level security;
alter table public.audit_logs enable row level security;

-- Supabase grants everything to anon/authenticated by default and lets RLS
-- filter rows. Here writes are taken away entirely and given back column by
-- column where a user may edit their own data.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.profiles, public.instructors, public.partners, public.price_versions,
  public.bookings, public.booking_meetings, public.audit_logs to authenticated;
grant select on public.price_versions to anon;

grant update (full_name, language) on public.profiles to authenticated;
grant update (years_experience, beaches, languages, has_equipment) on public.instructors to authenticated;

-- profiles: yourself, an admin, an approved instructor (their names appear in
-- the queue), or the other side of one of your bookings.
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or public.is_admin()
  or exists (select 1 from public.instructors i where i.id = profiles.id and i.status = 'approved')
  or exists (
    select 1 from public.bookings b
    where (b.student_id = auth.uid() and b.instructor_id = profiles.id)
       or (b.instructor_id = auth.uid() and b.student_id = profiles.id)
  )
);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- instructors: approved ones are public to signed-in users (the queue is
-- shown to every instructor); pending and paused only to themselves and admins.
create policy instructors_select on public.instructors for select to authenticated using (
  status = 'approved' or id = auth.uid() or public.is_admin()
);
create policy instructors_update_self on public.instructors for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy partners_select on public.partners for select to authenticated using (
  owner_id = auth.uid() or public.is_admin()
);

create policy price_versions_select on public.price_versions for select to anon, authenticated using (true);

-- bookings: the student, the assigned instructor, or an admin. Partners never
-- read bookings — they get aggregates from partner_summary().
create policy bookings_select on public.bookings for select to authenticated using (
  student_id = auth.uid() or instructor_id = auth.uid() or public.is_admin()
);

create policy booking_meetings_select on public.booking_meetings for select to authenticated using (
  exists (
    select 1 from public.bookings b
    where b.id = booking_meetings.booking_id
      and (b.student_id = auth.uid() or b.instructor_id = auth.uid() or public.is_admin())
  )
);

create policy audit_logs_select on public.audit_logs for select to authenticated using (public.is_admin());
