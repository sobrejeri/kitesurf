-- VENTO KITESURF | INSTALACAO UNICA | 06 A 19
-- GERADO A PARTIR DOS ARQUIVOS ORIGINAIS DO REPOSITOR, EM ORDEM.
-- SOMENTE USE SE AS MIGRACOES 06 A 19 AINDA NAO FOREM APLICADAS.
-- A migracao 04 (transporte) precisa estar aplicada antes; a 05 (perfil instrutor) tambem.
-- Execute ANTES o arquivo supabase/install/00_verificar_instalacao.sql.
-- EXECUCAO INTEIRA EM UMA TRANSACAO: ERRO = ROLLBACK DE TODAS AS MUDANCAS DESTE PACOTE.
-- Nunca execute este pacote duas vezes. Nao substitui backup/homologacao.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.create_booking(uuid,public.lesson_level,text,jsonb,text,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Pre-requisito 04 nao detectado: execute 20261031000004_support_vehicle.sql antes.';
  END IF;
  IF to_regclass('public.instructor_private_profiles') IS NULL THEN
    RAISE EXCEPTION 'Pre-requisito 05 nao detectado: execute 20261101000005_instructor_profile.sql antes.';
  END IF;
  IF to_regclass('public.student_private_profiles') IS NOT NULL THEN
    RAISE EXCEPTION 'A migracao 06 ja parece aplicada. NAO execute pacote integral; revise com SQL individual.';
  END IF;
END $$;


-- ============================================================== 
-- MIGRACAO ORIGINAL: supabase/migrations/20261101000006_student_avatar.sql
-- ============================================================== 
-- Vento: student private profile photos. Run on Supabase after checking backups.
-- Instructor photos remain in their existing private bucket. No payment changes.

create table if not exists public.student_private_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  avatar_path text check (
    avatar_path is null or (
      char_length(avatar_path) <= 200
      and avatar_path ~ '^[a-f0-9-]{36}/avatar\.(jpg|png|webp)$'
    )
  ),
  updated_at timestamptz not null default now()
);

alter table public.student_private_profiles enable row level security;
revoke all on public.student_private_profiles from anon, authenticated;
grant select on public.student_private_profiles to authenticated;
grant insert (id, avatar_path, updated_at) on public.student_private_profiles to authenticated;
grant update (avatar_path, updated_at) on public.student_private_profiles to authenticated;

drop policy if exists student_private_read_own on public.student_private_profiles;
create policy student_private_read_own on public.student_private_profiles
  for select to authenticated using (id = (select auth.uid()));
drop policy if exists student_private_insert_own on public.student_private_profiles;
create policy student_private_insert_own on public.student_private_profiles
  for insert to authenticated with check (id = (select auth.uid()));
drop policy if exists student_private_update_own on public.student_private_profiles;
create policy student_private_update_own on public.student_private_profiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Only the owning student can read/write images in their own UUID folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vento-student-avatars', 'vento-student-avatars', false, 3145728,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

drop policy if exists vento_student_avatar_select_own on storage.objects;
create policy vento_student_avatar_select_own on storage.objects
  for select to authenticated using (
    bucket_id = 'vento-student-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists vento_student_avatar_insert_own on storage.objects;
create policy vento_student_avatar_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'vento-student-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists vento_student_avatar_update_own on storage.objects;
create policy vento_student_avatar_update_own on storage.objects
  for update to authenticated using (
    bucket_id = 'vento-student-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'vento-student-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

notify pgrst, 'reload schema';


-- ============================================================== 
-- MIGRACAO ORIGINAL: supabase/migrations/20261101000007_instructor_schedules.sql
-- ============================================================== 
-- Stage 1: real instructor schedules, time blocks and anti-double booking.
-- Existing instructors remain unrestricted UNTIL they save a weekly schedule.
-- begin removido: pacote usa uma transacao unica
create table public.instructor_schedule_settings (
  instructor_id uuid primary key references public.instructors(id) on delete cascade,
  buffer_minutes integer not null default 0 check(buffer_minutes between 0 and 120),
  updated_at timestamptz not null default now()
);
create table public.instructor_weekly_hours (
  instructor_id uuid not null references public.instructor_schedule_settings(instructor_id) on delete cascade,
  weekday integer not null check(weekday between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  primary key(instructor_id,weekday), check(opens_at<closes_at)
);
create table public.instructor_time_off (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.instructors(id) on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null,
  reason text not null default '' check(length(reason)<=160),
  created_at timestamptz not null default now(),
  check(starts_at<ends_at)
);
create index instructor_time_off_idx on public.instructor_time_off(instructor_id,starts_at,ends_at);
alter table public.instructor_schedule_settings enable row level security;
alter table public.instructor_weekly_hours enable row level security;
alter table public.instructor_time_off enable row level security;
revoke all on public.instructor_schedule_settings,public.instructor_weekly_hours,public.instructor_time_off from public,anon,authenticated;
grant select on public.instructor_schedule_settings,public.instructor_weekly_hours,public.instructor_time_off to authenticated;
create policy schedule_self on public.instructor_schedule_settings for select to authenticated using(instructor_id=auth.uid() or public.is_admin());
create policy hours_self on public.instructor_weekly_hours for select to authenticated using(instructor_id=auth.uid() or public.is_admin());
create policy time_off_self on public.instructor_time_off for select to authenticated using(instructor_id=auth.uid() or public.is_admin());

create function public.save_my_schedule(p_days integer[],p_opens_at time,p_closes_at time,p_buffer_minutes integer)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['instructor']::public.app_role[]);
begin
  if not exists(select 1 from public.instructors where id=uid) then
    raise exception 'Instructor only' using errcode='42501'; end if;
  if p_days is null or cardinality(p_days)>7
    or exists(select 1 from unnest(p_days) d where d is null or d not between 0 and 6)
    or p_opens_at is null or p_closes_at is null or p_opens_at>=p_closes_at
    or p_buffer_minutes is null or p_buffer_minutes not between 0 and 120
  then raise exception 'Invalid schedule' using errcode='22023'; end if;
  insert into public.instructor_schedule_settings(instructor_id,buffer_minutes)
    values(uid,p_buffer_minutes)
    on conflict(instructor_id) do update set buffer_minutes=excluded.buffer_minutes,updated_at=now();
  delete from public.instructor_weekly_hours where instructor_id=uid;
  insert into public.instructor_weekly_hours(instructor_id,weekday,opens_at,closes_at)
    select uid,d,p_opens_at,p_closes_at from (select distinct unnest(p_days) as d) days;
  perform public.write_audit('instructor.schedule_saved','instructor',uid::text,null,
    jsonb_build_object('days',p_days,'opens',p_opens_at,'closes',p_closes_at,'buffer',p_buffer_minutes));
end $$;

create function public.block_my_time(p_start timestamptz,p_end timestamptz,p_reason text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['instructor']::public.app_role[]); block_id uuid;
begin
  if not exists(select 1 from public.instructors where id=uid) then
    raise exception 'Instructor only' using errcode='42501'; end if;
  if p_start is null or p_end is null or p_start<now() or p_end<=p_start
    or p_end>p_start+interval '30 days' or length(coalesce(p_reason,''))>160 then
    raise exception 'Invalid block' using errcode='22023'; end if;
  if exists(select 1 from public.booking_meetings m join public.bookings b on b.id=m.booking_id
    where b.instructor_id=uid and b.status='confirmed' and m.status<>'cancelled'
      and tstzrange(m.starts_at,m.starts_at+make_interval(mins=>m.minutes),'[)')
        && tstzrange(p_start,p_end,'[)'))
  then raise exception 'A confirmed class overlaps this block' using errcode='55000'; end if;
  insert into public.instructor_time_off(instructor_id,starts_at,ends_at,reason)
    values(uid,p_start,p_end,coalesce(p_reason,'')) returning id into block_id;
  perform public.write_audit('instructor.time_blocked','time_off',block_id::text,null,
    jsonb_build_object('start',p_start,'end',p_end),p_reason);
  return block_id;
end $$;

create function public.unblock_my_time(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['instructor']::public.app_role[]);
begin
  delete from public.instructor_time_off where id=p_id and instructor_id=uid;
  if not found then raise exception 'Block not found' using errcode='P0002'; end if;
  perform public.write_audit('instructor.time_unblocked','time_off',p_id::text,null,null);
end $$;

create function public.instructor_can_attend(p_id uuid,p_meetings jsonb)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v jsonb; st timestamptz; en timestamptz; local_st timestamp; local_en timestamp;
  buff integer:=0; configured boolean;
begin
  select buffer_minutes into buff from public.instructor_schedule_settings where instructor_id=p_id;
  configured:=found; buff:=coalesce(buff,0);
  if jsonb_typeof(p_meetings)<>'array' then return false; end if;
  for v in select value from jsonb_array_elements(p_meetings) loop
    st:=(v->>'starts_at')::timestamptz;
    en:=st+make_interval(hours=>(v->>'hours')::integer);
    local_st:=st at time zone 'America/Fortaleza';
    local_en:=en at time zone 'America/Fortaleza';
    if configured and not exists(select 1 from public.instructor_weekly_hours h
      where h.instructor_id=p_id and h.weekday=extract(dow from local_st)::integer
      and local_st::date=local_en::date and local_st::time>=h.opens_at
      and local_en::time<=h.closes_at) then return false; end if;
    if exists(select 1 from public.instructor_time_off t where t.instructor_id=p_id
      and tstzrange(t.starts_at,t.ends_at,'[)') && tstzrange(st,en,'[)'))
    then return false; end if;
    if exists(select 1 from public.booking_meetings m join public.bookings b on b.id=m.booking_id
      where b.instructor_id=p_id and m.status<>'cancelled'
      and (b.status='confirmed' or (b.status='awaiting_payment'
          and b.created_at>=now()-interval '10 minutes'))
      and tstzrange(m.starts_at-make_interval(mins=>buff),
        m.starts_at+make_interval(mins=>m.minutes+buff),'[)') && tstzrange(st,en,'[)'))
    then return false; end if;
  end loop;
  return true;
end $$;
revoke execute on function public.instructor_can_attend(uuid,jsonb) from public,anon,authenticated;
revoke execute on function public.save_my_schedule(integer[],time,time,integer) from public,anon;
revoke execute on function public.block_my_time(timestamptz,timestamptz,text) from public,anon;
revoke execute on function public.unblock_my_time(uuid) from public,anon;
grant execute on function public.save_my_schedule(integer[],time,time,integer) to authenticated;
grant execute on function public.block_my_time(timestamptz,timestamptz,text) to authenticated;
grant execute on function public.unblock_my_time(uuid) to authenticated;
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
  update public.bookings set status = 'confirmed', confirmed_at = now() where id = b.id;
  -- The instructor's turn is used: back to the end of the queue.
  update public.instructors set queue_position = nextval('public.instructor_queue_seq')
  where id = b.instructor_id;

  perform public.write_audit('booking.payment_confirmed_test', 'booking', b.id::text,
    jsonb_build_object('status', b.status), jsonb_build_object('status', 'confirmed'),
    'Test payment — no money moved');
end;
$$;
-- commit removido: pacote usa uma transacao unica


-- ============================================================== 
-- MIGRACAO ORIGINAL: supabase/migrations/20261101000008_booking_messages.sql
-- ============================================================== 
-- Stage 2: persistent private booking conversation.
-- begin removido: pacote usa uma transacao unica
create table public.booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null check(length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index booking_messages_read_idx on public.booking_messages(booking_id,created_at,id);
alter table public.booking_messages enable row level security;
revoke all on public.booking_messages from public,anon,authenticated;
grant select on public.booking_messages to authenticated;
create policy booking_messages_participants on public.booking_messages for select to authenticated using(
  exists (select 1 from public.bookings b where b.id=booking_id
   and b.status in ('confirmed','completed')
   and (b.student_id=auth.uid() or b.instructor_id=auth.uid()))
);

create function public.send_booking_message(p_booking_id uuid,p_body text) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  uid uuid:=public.require_role(array['student','instructor']::public.app_role[]);
  recipient public.bookings; new_id uuid;
begin
  if p_body is null or length(btrim(p_body)) not between 1 and 2000 then
    raise exception 'Message must be 1 to 2000 characters' using errcode='22023';
  end if;
  select * into recipient from public.bookings where id=p_booking_id;
  if recipient.id is null or recipient.status not in ('confirmed','completed')
     or (recipient.student_id<>uid and recipient.instructor_id is distinct from uid) then
    raise exception 'Conversation unavailable' using errcode='42501';
  end if;
  -- Prevent a single user from flooding the conversation with rapid requests.
  if exists(select 1 from public.booking_messages m where m.booking_id=p_booking_id
    and m.sender_id=uid and m.created_at>now()-interval '2 seconds') then
    raise exception 'Please wait before sending again' using errcode='55000';
  end if;
  insert into public.booking_messages(booking_id,sender_id,body)
    values(p_booking_id,uid,btrim(p_body)) returning id into new_id;
  return new_id;
end $$;
revoke execute on function public.send_booking_message(uuid,text) from public,anon;
grant execute on function public.send_booking_message(uuid,text) to authenticated;
-- commit removido: pacote usa uma transacao unica


-- ============================================================== 
-- MIGRACAO ORIGINAL: supabase/migrations/20261101000009_test_checkout.sql
-- ============================================================== 
-- Stage 2: simulated checkout methods and outcomes; NEVER charge real money.
-- begin removido: pacote usa uma transacao unica
create table public.test_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  student_id uuid not null references public.profiles(id),
  method text not null check(method in ('pix','card')),
  outcome text not null check(outcome in ('approved','pending','declined')),
  created_at timestamptz not null default now()
);
create index test_payment_attempt_idx on public.test_payment_attempts(booking_id,created_at desc);
alter table public.test_payment_attempts enable row level security;
revoke all on public.test_payment_attempts from public,anon,authenticated;
grant select on public.test_payment_attempts to authenticated;
create policy test_payment_owner on public.test_payment_attempts for select to authenticated
using(student_id=auth.uid() or public.is_admin());

create function public.simulate_test_payment(p_booking_id uuid,p_method text,p_outcome text)
returns text language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['student']::public.app_role[]); b public.bookings;
begin
  if p_method not in ('pix','card') or p_outcome not in ('approved','pending','declined')
    or p_method is null or p_outcome is null then
    raise exception 'Invalid test payment parameters' using errcode='22023'; end if;
  select * into b from public.bookings where id=p_booking_id for update;
  if b.id is null or b.student_id<>uid then
    raise exception 'Booking not found' using errcode='P0002'; end if;
  if b.status<>'awaiting_payment' or b.created_at<now()-interval '10 minutes' then
    raise exception 'Payment window expired or booking no longer payable' using errcode='55000'; end if;
  if p_outcome='approved' then
    perform public.confirm_test_payment(p_booking_id);
  end if;
  insert into public.test_payment_attempts(booking_id,student_id,method,outcome)
    values(p_booking_id,uid,p_method,p_outcome);
  perform public.write_audit('booking.payment_simulated','booking',p_booking_id::text,null,
    jsonb_build_object('method',p_method,'outcome',p_outcome),'Simulated payment only');
  return p_outcome;
end $$;
revoke execute on function public.simulate_test_payment(uuid,text,text) from public,anon;
grant execute on function public.simulate_test_payment(uuid,text,text) to authenticated;
-- commit removido: pacote usa uma transacao unica


-- ============================================================== 
-- MIGRACAO ORIGINAL: supabase/migrations/20261101000010_first_paid_referral.sql
-- ============================================================== 
-- Stage 3: do not award an inn a commission after the customer's first paid booking.
-- Legacy bookings keep immutable snapshots. Old overlapping pending affiliate
-- claims are rejected at test payment instead of silently double-paying.
-- begin removido: pacote usa uma transacao unica
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
-- commit removido: pacote usa uma transacao unica


-- ============================================================== 
-- MIGRACAO ORIGINAL: supabase/migrations/20261101000011_instructor_offers.sql
-- ============================================================== 
-- Phase 4: offers before payment, preserving all legacy bookings.
-- Requests live separately; a booking is only created after the instructor accepts.
-- Offer lifetime: 2 minutes. Search lifetime: 6 minutes. Checkout: 10 minutes.
-- begin removido: pacote usa uma transacao unica
create table public.instructor_requests (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.profiles(id),
 beach_id uuid not null references public.beaches(id),
 level public.lesson_level not null,
 language text not null check(length(language) between 1 and 40),
 meetings jsonb not null check(jsonb_typeof(meetings)='array'),
 total_hours integer not null check(total_hours between 1 and 8),
 with_transport boolean not null default false,
 partner_code text,
 price_version_id bigint not null references public.price_versions(id),
 status text not null default 'searching' check(status in ('searching','accepted','expired','cancelled')),
 booking_id uuid unique references public.bookings(id),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '6 minutes')
);
create index instructor_requests_student_idx on public.instructor_requests(student_id,created_at desc);
create table public.instructor_offers (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.instructor_requests(id) on delete cascade,
 instructor_id uuid not null references public.instructors(id),
 status text not null default 'offered' check(status in ('offered','accepted','declined','expired')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 responded_at timestamptz,
 unique(request_id,instructor_id)
);
create unique index instructor_one_open_offer_per_request
 on public.instructor_offers(request_id) where status='offered';
create index instructor_offer_inbox on public.instructor_offers(instructor_id,status,expires_at);

alter table public.instructor_requests enable row level security;
alter table public.instructor_offers enable row level security;
revoke all on public.instructor_requests,public.instructor_offers from public,anon,authenticated;
grant select on public.instructor_requests,public.instructor_offers to authenticated;
create policy request_visible_to_participants on public.instructor_requests for select to authenticated using (
  student_id=auth.uid() or public.is_admin()
  or exists(select 1 from public.instructor_offers o where o.request_id=id and o.instructor_id=auth.uid())
);
create policy offer_visible_to_participants on public.instructor_offers for select to authenticated using(
  instructor_id=auth.uid() or public.is_admin()
);

-- Only our other SECURITY DEFINER functions call this helper, not browser clients.
create function public.advance_instructor_offer(p_request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.instructor_requests; i record; v_offer uuid; v_busy boolean;
begin
  select * into r from public.instructor_requests where id=p_request_id for update;
  if r.id is null or r.status<>'searching' then return null; end if;
  if r.expires_at<=now() then
    update public.instructor_offers set status='expired',responded_at=now()
      where request_id=r.id and status='offered';
    update public.instructor_requests set status='expired' where id=r.id;
    return null;
  end if;
  update public.instructor_offers set status='expired',responded_at=now()
    where request_id=r.id and status='offered' and expires_at<=now();
  select id into v_offer from public.instructor_offers
    where request_id=r.id and status='offered' and expires_at>now() limit 1;
  if v_offer is not null then return v_offer; end if;

  -- Recheck each candidate only AFTER locking its row. Two concurrent
  -- requests cannot hand the same teacher overlapping active offers.
  for i in
    select ins.id from public.instructors ins
    where ins.status='approved'
      and exists(select 1 from public.instructor_beaches ib
        where ib.instructor_id=ins.id and ib.beach_id=r.beach_id)
      and r.language=any(ins.languages)
      and (not r.with_transport or ins.has_support_vehicle)
      and not exists(select 1 from public.instructor_offers previous
        where previous.request_id=r.id and previous.instructor_id=ins.id)
    order by ins.queue_position nulls last,ins.id
    for update of ins skip locked
  loop
    if not public.instructor_can_attend(i.id,r.meetings) then continue; end if;
    select exists (
      select 1 from public.instructor_offers o
      join public.instructor_requests other on other.id=o.request_id
      cross join lateral jsonb_array_elements(other.meetings) existing_meeting
      cross join lateral jsonb_array_elements(r.meetings) proposed_meeting
      where o.instructor_id=i.id and o.status='offered' and o.expires_at>now()
        and other.status='searching' and other.id<>r.id
        and tstzrange((existing_meeting->>'starts_at')::timestamptz,
          (existing_meeting->>'starts_at')::timestamptz
            + make_interval(hours=>(existing_meeting->>'hours')::integer),'[)')
          && tstzrange((proposed_meeting->>'starts_at')::timestamptz,
          (proposed_meeting->>'starts_at')::timestamptz
            + make_interval(hours=>(proposed_meeting->>'hours')::integer),'[)')
    ) into v_busy;
    if v_busy then continue; end if;
    insert into public.instructor_offers(request_id,instructor_id,expires_at)
      values(r.id,i.id,least(now()+interval '2 minutes',r.expires_at))
      returning id into v_offer;
    perform public.write_audit('offer.sent','instructor_offer',v_offer::text,null,
      jsonb_build_object('request',r.id,'instructor',i.id));
    return v_offer;
  end loop;
  return null;
end $$;
revoke execute on function public.advance_instructor_offer(uuid) from public,anon,authenticated;

create function public.create_instructor_request(
 p_beach_id uuid,p_level public.lesson_level,p_language text,
 p_meetings jsonb,p_partner_code text default null,p_with_transport boolean default false
) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['student']::public.app_role[]);
  price public.price_versions:=public.current_price_version();
  m jsonb; total integer:=0; len integer; req uuid;
begin
  if price.id is null then raise exception 'No price published' using errcode='P0002'; end if;
  if p_beach_id is null or not exists(select 1 from public.beaches where id=p_beach_id and active) then
    raise exception 'Unknown or inactive beach' using errcode='22023'; end if;
  if p_language is null or length(p_language) not between 1 and 40 then
    raise exception 'Invalid language' using errcode='22023'; end if;
  if coalesce(p_with_transport,false) and price.transport_hourly_cents<=0 then
    raise exception 'Support vehicle not available' using errcode='22023'; end if;
  if jsonb_typeof(p_meetings)<>'array' then raise exception 'Invalid meetings' using errcode='22023'; end if;
  len:=jsonb_array_length(p_meetings);
  if len not between 1 and 8 then raise exception 'Invalid meeting count' using errcode='22023'; end if;
  for m in select value from jsonb_array_elements(p_meetings) loop
    if (m->>'hours')::integer not between 1 and 8
      or (m->>'starts_at')::timestamptz < now()+interval '1 hour' then
      raise exception 'Invalid meeting date or hours' using errcode='22023'; end if;
    total:=total+(m->>'hours')::integer;
  end loop;
  if total not between 1 and 8 then raise exception 'Invalid total hours' using errcode='22023'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_meetings) with ordinality a(m,n)
    join jsonb_array_elements(p_meetings) with ordinality b(m,n) on a.n<b.n
    where tstzrange((a.m->>'starts_at')::timestamptz,
      (a.m->>'starts_at')::timestamptz+make_interval(hours=>(a.m->>'hours')::integer),'[)')
      && tstzrange((b.m->>'starts_at')::timestamptz,
      (b.m->>'starts_at')::timestamptz+make_interval(hours=>(b.m->>'hours')::integer),'[)')
  ) then raise exception 'Overlapping meetings' using errcode='22023'; end if;
  insert into public.instructor_requests
    (student_id,beach_id,level,language,meetings,total_hours,with_transport,partner_code,price_version_id)
  values(uid,p_beach_id,p_level,p_language,p_meetings,total,coalesce(p_with_transport,false),
    nullif(upper(btrim(coalesce(p_partner_code,''))),''),price.id) returning id into req;
  perform public.advance_instructor_offer(req);
  return req;
end $$;

-- Student refreshes the search; or an instructor opens their inbox.
create function public.refresh_instructor_request(p_request_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['student','instructor']::public.app_role[]);
begin
  if not exists(select 1 from public.instructor_requests r where r.id=p_request_id
    and (r.student_id=uid or exists(select 1 from public.instructor_offers o
      where o.request_id=r.id and o.instructor_id=uid))) then
    raise exception 'Request not found' using errcode='P0002'; end if;
  perform public.advance_instructor_offer(p_request_id);
end $$;

create function public.decline_instructor_offer(p_offer_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['instructor']::public.app_role[]);
  r public.instructor_requests; o public.instructor_offers; req uuid;
begin
  select request_id into req from public.instructor_offers where id=p_offer_id and instructor_id=uid;
  if req is null then raise exception 'Offer not found' using errcode='P0002'; end if;
  select * into r from public.instructor_requests where id=req for update;
  select * into o from public.instructor_offers where id=p_offer_id for update;
  if r.status<>'searching' or o.status<>'offered' then return; end if;
  update public.instructor_offers set status='declined',responded_at=now() where id=o.id;
  perform public.write_audit('offer.declined','instructor_offer',o.id::text,null,null);
  perform public.advance_instructor_offer(r.id);
end $$;

create function public.accept_instructor_offer(p_offer_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['instructor']::public.app_role[]);
  req_id uuid; r public.instructor_requests; o public.instructor_offers;
  price public.price_versions; partner public.partners; instructor public.instructors;
  total_lesson integer; total_transport integer; split record; v_booking_id uuid;
  meeting jsonb; position integer:=0;
begin
  select request_id into req_id from public.instructor_offers
    where id=p_offer_id and instructor_id=uid;
  if req_id is null then raise exception 'Offer not found' using errcode='P0002'; end if;
  select * into r from public.instructor_requests where id=req_id for update;
  select * into o from public.instructor_offers where id=p_offer_id for update;
  if r.status<>'searching' or o.status<>'offered' or o.expires_at<=now() or r.expires_at<=now() then
    perform public.advance_instructor_offer(req_id);
    return null;
  end if;
  select * into instructor from public.instructors where id=uid for update;
  if instructor.status<>'approved' or not public.instructor_can_attend(uid,r.meetings)
    or not exists(select 1 from public.instructor_beaches ib
      where ib.instructor_id=uid and ib.beach_id=r.beach_id)
    or r.language<>all(instructor.languages)
    or (r.with_transport and not instructor.has_support_vehicle) then
    update public.instructor_offers set status='declined',responded_at=now() where id=o.id;
    perform public.advance_instructor_offer(req_id);
    return null;
  end if;
  select * into price from public.price_versions where id=r.price_version_id;
  if price.id is null then raise exception 'Price version unavailable' using errcode='P0002'; end if;
  if r.partner_code is not null
     and not exists(select 1 from public.bookings already
      where already.student_id=r.student_id and already.status in ('confirmed','completed')) then
    select * into partner from public.partners where code=r.partner_code and status='approved';
  end if;
  total_lesson:=r.total_hours*price.hourly_rate_cents;
  total_transport:=case when r.with_transport then r.total_hours*price.transport_hourly_cents else 0 end;
  select * into split from public.split_total(total_lesson,price.platform_commission_bps,partner.commission_bps);
  insert into public.bookings
    (code,student_id,instructor_id,partner_id,price_version_id,beach_id,level,language,total_hours,
     hourly_rate_cents,with_transport,transport_hourly_cents,transport_cents,total_cents,
     partner_cents,platform_cents,instructor_net_cents,presence_code)
  values('VNT-'||nextval('public.booking_code_seq'),r.student_id,uid,partner.id,price.id,
     r.beach_id,r.level,r.language,r.total_hours,price.hourly_rate_cents,
     r.with_transport,case when r.with_transport then price.transport_hourly_cents else 0 end,
     total_transport,total_lesson+total_transport,split.partner_cents,split.platform_cents,
     split.instructor_net_cents+total_transport,
     lpad(floor(random()*10000)::integer::text,4,'0'))
  returning id into v_booking_id;
  for meeting in select value from jsonb_array_elements(r.meetings)
    order by (value->>'starts_at')::timestamptz loop
    position:=position+1;
    insert into public.booking_meetings(booking_id,position,starts_at,minutes)
      values(v_booking_id,position,(meeting->>'starts_at')::timestamptz,(meeting->>'hours')::integer*60);
  end loop;
  update public.instructor_requests set status='accepted',booking_id=v_booking_id
    where id=r.id;
  update public.instructor_offers set status='accepted',responded_at=now() where id=o.id;
  perform public.write_audit('offer.accepted','instructor_offer',o.id::text,null,
    jsonb_build_object('booking',v_booking_id));
  return v_booking_id;
end $$;

revoke execute on function public.create_instructor_request(uuid,public.lesson_level,text,jsonb,text,boolean) from public,anon;
revoke execute on function public.refresh_instructor_request(uuid) from public,anon;
revoke execute on function public.decline_instructor_offer(uuid) from public,anon;
revoke execute on function public.accept_instructor_offer(uuid) from public,anon;
grant execute on function public.create_instructor_request(uuid,public.lesson_level,text,jsonb,text,boolean) to authenticated;
grant execute on function public.refresh_instructor_request(uuid) to authenticated;
grant execute on function public.decline_instructor_offer(uuid) to authenticated;
grant execute on function public.accept_instructor_offer(uuid) to authenticated;
-- commit removido: pacote usa uma transacao unica


-- ============================================================== 
-- MIGRACAO ORIGINAL: supabase/migrations/20261101000012_instructor_ratings.sql
-- ============================================================== 
-- Instructor feedback: one verified student review per completed booking.
-- begin removido: pacote usa uma transacao unica
create table public.instructor_ratings (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null unique references public.bookings(id) on delete cascade,
 instructor_id uuid not null references public.instructors(id),
 student_id uuid not null references public.profiles(id),
 stars integer not null check(stars between 1 and 5),
 comment text not null default '' check(length(comment)<=500),
 created_at timestamptz not null default now()
);
create index instructor_ratings_teacher_idx on public.instructor_ratings(instructor_id,created_at desc);
alter table public.instructor_ratings enable row level security;
revoke all on public.instructor_ratings from public,anon,authenticated;
grant select on public.instructor_ratings to authenticated;
create policy ratings_view_participants on public.instructor_ratings for select to authenticated
 using(student_id=auth.uid() or instructor_id=auth.uid() or public.is_admin());

create function public.rate_completed_booking(p_booking_id uuid,p_stars integer,p_comment text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['student']::public.app_role[]);
  b public.bookings; rid uuid;
begin
  if p_stars not between 1 and 5 or p_stars is null
     or length(coalesce(p_comment,''))>500 then
    raise exception 'Invalid rating' using errcode='22023'; end if;
  select * into b from public.bookings where id=p_booking_id;
  if b.id is null or b.student_id<>uid or b.status<>'completed'
      or b.instructor_id is null then
    raise exception 'Only completed own lessons can be rated' using errcode='42501'; end if;
  insert into public.instructor_ratings(booking_id,instructor_id,student_id,stars,comment)
    values(b.id,b.instructor_id,uid,p_stars,btrim(coalesce(p_comment,'')))
    on conflict(booking_id) do nothing returning id into rid;
  if rid is null then raise exception 'Booking already rated' using errcode='23505'; end if;
  perform public.write_audit('instructor.rated','instructor',b.instructor_id::text,null,
    jsonb_build_object('booking',b.id,'stars',p_stars));
  return rid;
end $$;
revoke execute on function public.rate_completed_booking(uuid,integer,text) from public,anon;
grant execute on function public.rate_completed_booking(uuid,integer,text) to authenticated;
-- commit removido: pacote usa uma transacao unica


-- ============================================================== 
-- MIGRACAO ORIGINAL: supabase/migrations/20261101000013_preferred_instructor.sql
-- ============================================================== 
-- Phase 5: request a previous instructor again, with queue fallback.
-- A preference is authorized by an earlier confirmed/completed booking.
-- begin removido: pacote usa uma transacao unica
alter table public.instructor_requests
  add column preferred_instructor_id uuid references public.instructors(id);
create or replace function public.advance_instructor_offer(p_request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.instructor_requests; i record; v_offer uuid; v_busy boolean;
begin
  select * into r from public.instructor_requests where id=p_request_id for update;
  if r.id is null or r.status<>'searching' then return null; end if;
  if r.expires_at<=now() then
    update public.instructor_offers set status='expired',responded_at=now()
      where request_id=r.id and status='offered';
    update public.instructor_requests set status='expired' where id=r.id;
    return null;
  end if;
  update public.instructor_offers set status='expired',responded_at=now()
    where request_id=r.id and status='offered' and expires_at<=now();
  select id into v_offer from public.instructor_offers
    where request_id=r.id and status='offered' and expires_at>now() limit 1;
  if v_offer is not null then return v_offer; end if;

  -- Recheck each candidate only AFTER locking its row. Two concurrent
  -- requests cannot hand the same teacher overlapping active offers.
  for i in
    select ins.id from public.instructors ins
    where ins.status='approved'
      and exists(select 1 from public.instructor_beaches ib
        where ib.instructor_id=ins.id and ib.beach_id=r.beach_id)
      and r.language=any(ins.languages)
      and (not r.with_transport or ins.has_support_vehicle)
      and not exists(select 1 from public.instructor_offers previous
        where previous.request_id=r.id and previous.instructor_id=ins.id)
    order by case when ins.id=r.preferred_instructor_id then 0 else 1 end, ins.queue_position nulls last,ins.id
    for update of ins skip locked
  loop
    if not public.instructor_can_attend(i.id,r.meetings) then continue; end if;
    select exists (
      select 1 from public.instructor_offers o
      join public.instructor_requests other on other.id=o.request_id
      cross join lateral jsonb_array_elements(other.meetings) existing_meeting
      cross join lateral jsonb_array_elements(r.meetings) proposed_meeting
      where o.instructor_id=i.id and o.status='offered' and o.expires_at>now()
        and other.status='searching' and other.id<>r.id
        and tstzrange((existing_meeting->>'starts_at')::timestamptz,
          (existing_meeting->>'starts_at')::timestamptz
            + make_interval(hours=>(existing_meeting->>'hours')::integer),'[)')
          && tstzrange((proposed_meeting->>'starts_at')::timestamptz,
          (proposed_meeting->>'starts_at')::timestamptz
            + make_interval(hours=>(proposed_meeting->>'hours')::integer),'[)')
    ) into v_busy;
    if v_busy then continue; end if;
    insert into public.instructor_offers(request_id,instructor_id,expires_at)
      values(r.id,i.id,least(now()+interval '2 minutes',r.expires_at))
      returning id into v_offer;
    perform public.write_audit('offer.sent','instructor_offer',v_offer::text,null,
      jsonb_build_object('request',r.id,'instructor',i.id));
    return v_offer;
  end loop;
  return null;
end $$;
create function public.create_instructor_request_with_preference(
 p_beach_id uuid,p_level public.lesson_level,p_language text,
 p_meetings jsonb,p_partner_code text,p_with_transport boolean,p_preferred_instructor_id uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['student']::public.app_role[]);
  price public.price_versions:=public.current_price_version();
  m jsonb; total integer:=0; len integer; req uuid;
begin
  if price.id is null then raise exception 'No price published' using errcode='P0002'; end if;
  if p_beach_id is null or not exists(select 1 from public.beaches where id=p_beach_id and active) then
    raise exception 'Unknown or inactive beach' using errcode='22023'; end if;
  if p_language is null or length(p_language) not between 1 and 40 then
    raise exception 'Invalid language' using errcode='22023'; end if;
  if coalesce(p_with_transport,false) and price.transport_hourly_cents<=0 then
    raise exception 'Support vehicle not available' using errcode='22023'; end if;
  if jsonb_typeof(p_meetings)<>'array' then raise exception 'Invalid meetings' using errcode='22023'; end if;
  len:=jsonb_array_length(p_meetings);
  if len not between 1 and 8 then raise exception 'Invalid meeting count' using errcode='22023'; end if;
  for m in select value from jsonb_array_elements(p_meetings) loop
    if (m->>'hours')::integer not between 1 and 8
      or (m->>'starts_at')::timestamptz < now()+interval '1 hour' then
      raise exception 'Invalid meeting date or hours' using errcode='22023'; end if;
    total:=total+(m->>'hours')::integer;
  end loop;
  if total not between 1 and 8 then raise exception 'Invalid total hours' using errcode='22023'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_meetings) with ordinality a(m,n)
    join jsonb_array_elements(p_meetings) with ordinality b(m,n) on a.n<b.n
    where tstzrange((a.m->>'starts_at')::timestamptz,
      (a.m->>'starts_at')::timestamptz+make_interval(hours=>(a.m->>'hours')::integer),'[)')
      && tstzrange((b.m->>'starts_at')::timestamptz,
      (b.m->>'starts_at')::timestamptz+make_interval(hours=>(b.m->>'hours')::integer),'[)')
  ) then raise exception 'Overlapping meetings' using errcode='22023'; end if;
  if p_preferred_instructor_id is not null and not exists(
    select 1 from public.bookings b
      where b.student_id=uid and b.instructor_id=p_preferred_instructor_id
        and b.status in ('confirmed','completed')
  ) then
    raise exception 'Previous lesson with this instructor not found' using errcode='42501';
  end if;
  insert into public.instructor_requests
    (student_id,beach_id,level,language,meetings,total_hours,with_transport,partner_code,price_version_id,preferred_instructor_id)
  values(uid,p_beach_id,p_level,p_language,p_meetings,total,coalesce(p_with_transport,false),
    nullif(upper(btrim(coalesce(p_partner_code,''))),''),price.id,p_preferred_instructor_id)
    returning id into req;
  perform public.advance_instructor_offer(req);
  return req;
end $$;
revoke execute on function public.create_instructor_request_with_preference(
  uuid,public.lesson_level,text,jsonb,text,boolean,uuid) from public,anon;
grant execute on function public.create_instructor_request_with_preference(
  uuid,public.lesson_level,text,jsonb,text,boolean,uuid) to authenticated;
-- commit removido: pacote usa uma transacao unica


-- ============================================================== 
-- MIGRACAO ORIGINAL: supabase/migrations/20261101000014_date_suggestions.sql
-- ============================================================== 
-- Phase 6: instructors can propose alternative meeting dates; students approve
-- changes explicitly. No charge or financial snapshot changes before acceptance.
-- begin removido: pacote usa uma transacao unica
alter table public.instructor_offers drop constraint instructor_offers_status_check;
alter table public.instructor_offers
  add constraint instructor_offers_status_check check(status in ('offered','accepted','declined','expired','suggested'));
alter table public.instructor_offers
  add column suggested_meetings jsonb,
  add column suggested_at timestamptz;

create or replace function public.advance_instructor_offer(p_request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.instructor_requests; i record; v_offer uuid; v_busy boolean;
begin
  select * into r from public.instructor_requests where id=p_request_id for update;
  if r.id is null or r.status<>'searching' then return null; end if;
  if r.expires_at<=now() then
    update public.instructor_offers set status='expired',responded_at=now()
      where request_id=r.id and status in ('offered','suggested');
    update public.instructor_requests set status='expired' where id=r.id;
    return null;
  end if;
  update public.instructor_offers set status='expired',responded_at=now()
    where request_id=r.id and status in ('offered','suggested') and expires_at<=now();
  select id into v_offer from public.instructor_offers
    where request_id=r.id and status in ('offered','suggested') and expires_at>now() limit 1;
  if v_offer is not null then return v_offer; end if;

  -- Recheck each candidate only AFTER locking its row. Two concurrent
  -- requests cannot hand the same teacher overlapping active offers.
  for i in
    select ins.id from public.instructors ins
    where ins.status='approved'
      and exists(select 1 from public.instructor_beaches ib
        where ib.instructor_id=ins.id and ib.beach_id=r.beach_id)
      and r.language=any(ins.languages)
      and (not r.with_transport or ins.has_support_vehicle)
      and not exists(select 1 from public.instructor_offers previous
        where previous.request_id=r.id and previous.instructor_id=ins.id)
    order by case when ins.id=r.preferred_instructor_id then 0 else 1 end, ins.queue_position nulls last,ins.id
    for update of ins skip locked
  loop
    -- A previously chosen instructor may be unavailable for the original
    -- dates but still needs the chance to suggest another date to the student.
    if i.id is distinct from r.preferred_instructor_id
       and not public.instructor_can_attend(i.id,r.meetings) then continue; end if;
    select exists (
      select 1 from public.instructor_offers o
      join public.instructor_requests other on other.id=o.request_id
      cross join lateral jsonb_array_elements(other.meetings) existing_meeting
      cross join lateral jsonb_array_elements(r.meetings) proposed_meeting
      where o.instructor_id=i.id and o.status='offered' and o.expires_at>now()
        and other.status='searching' and other.id<>r.id
        and tstzrange((existing_meeting->>'starts_at')::timestamptz,
          (existing_meeting->>'starts_at')::timestamptz
            + make_interval(hours=>(existing_meeting->>'hours')::integer),'[)')
          && tstzrange((proposed_meeting->>'starts_at')::timestamptz,
          (proposed_meeting->>'starts_at')::timestamptz
            + make_interval(hours=>(proposed_meeting->>'hours')::integer),'[)')
    ) into v_busy;
    if v_busy then continue; end if;
    insert into public.instructor_offers(request_id,instructor_id,expires_at)
      values(r.id,i.id,least(now()+interval '2 minutes',r.expires_at))
      returning id into v_offer;
    perform public.write_audit('offer.sent','instructor_offer',v_offer::text,null,
      jsonb_build_object('request',r.id,'instructor',i.id));
    return v_offer;
  end loop;
  return null;
end $$;

create function public.suggest_instructor_dates(p_offer_id uuid,p_meetings jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['instructor']::public.app_role[]);
  req_id uuid; r public.instructor_requests; o public.instructor_offers;
  m jsonb; total integer:=0;
begin
  select request_id into req_id from public.instructor_offers
    where id=p_offer_id and instructor_id=uid;
  if req_id is null then raise exception 'Offer not found' using errcode='P0002'; end if;
  select * into r from public.instructor_requests where id=req_id for update;
  select * into o from public.instructor_offers where id=p_offer_id for update;
  if r.status<>'searching' or o.status<>'offered' or o.expires_at<=now()
    or r.expires_at<=now() then
    raise exception 'Offer expired' using errcode='55000'; end if;
  if jsonb_typeof(p_meetings)<>'array' or jsonb_array_length(p_meetings) not between 1 and 8 then
    raise exception 'Invalid proposed meetings' using errcode='22023'; end if;
  for m in select value from jsonb_array_elements(p_meetings) loop
    if (m->>'hours')::integer not between 1 and 8 or
      (m->>'starts_at')::timestamptz < now()+interval '1 hour' then
      raise exception 'Invalid proposed meeting' using errcode='22023'; end if;
    total:=total+(m->>'hours')::integer;
  end loop;
  if total<>r.total_hours then
    raise exception 'Proposed hours must match contracted hours' using errcode='22023'; end if;
  if exists(
    select 1 from jsonb_array_elements(p_meetings) with ordinality a(m,n)
    join jsonb_array_elements(p_meetings) with ordinality b(m,n) on a.n<b.n
    where tstzrange((a.m->>'starts_at')::timestamptz,
      (a.m->>'starts_at')::timestamptz+make_interval(hours=>(a.m->>'hours')::integer),'[)')
      && tstzrange((b.m->>'starts_at')::timestamptz,
      (b.m->>'starts_at')::timestamptz+make_interval(hours=>(b.m->>'hours')::integer),'[)')
  ) then raise exception 'Proposed meetings overlap' using errcode='22023'; end if;
  if not public.instructor_can_attend(uid,p_meetings) then
    raise exception 'Suggested dates are unavailable' using errcode='55000'; end if;
  update public.instructor_offers
    set status='suggested',suggested_meetings=p_meetings,suggested_at=now(),
      expires_at=now()+interval '15 minutes'
    where id=o.id;
  update public.instructor_requests
    set expires_at=now()+interval '15 minutes' where id=r.id;
  perform public.write_audit('offer.dates_suggested','instructor_offer',o.id::text,null,
    jsonb_build_object('meetings',p_meetings));
end $$;

-- Prevent the student from enumerating instructors' private offers.
-- A SECURITY DEFINER RPC reveals only the suggestion on their OWN request.
create function public.read_my_offer_suggestion(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['student']::public.app_role[]);
  proposal record;
begin
  if not exists(select 1 from public.instructor_requests
     where id=p_request_id and student_id=uid) then
    raise exception 'Request not found' using errcode='P0002'; end if;
  select o.id,o.suggested_meetings,o.expires_at
    into proposal from public.instructor_offers o
    where o.request_id=p_request_id and o.status='suggested'
      and o.expires_at>now() limit 1;
  if proposal.id is null then return null; end if;
  return jsonb_build_object('id',proposal.id,'meetings',proposal.suggested_meetings,
    'expires_at',proposal.expires_at);
end $$;

create function public.respond_to_offer_suggestion(p_offer_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['student']::public.app_role[]);
  req_id uuid; r public.instructor_requests; o public.instructor_offers;
begin
  select request_id into req_id from public.instructor_offers where id=p_offer_id;
  if req_id is null then raise exception 'Offer not found' using errcode='P0002'; end if;
  select * into r from public.instructor_requests where id=req_id for update;
  if r.student_id<>uid then raise exception 'Not your request' using errcode='42501'; end if;
  select * into o from public.instructor_offers where id=p_offer_id for update;
  if r.status<>'searching' or o.status<>'suggested' or o.expires_at<=now() then
    raise exception 'Proposal unavailable' using errcode='55000'; end if;
  if coalesce(p_accept,false) then
    update public.instructor_requests set meetings=o.suggested_meetings
      where id=r.id;
    update public.instructor_offers set status='offered',
      expires_at=least(now()+interval '2 minutes',r.expires_at)
      where id=o.id;
    perform public.write_audit('offer.dates_approved','instructor_offer',o.id::text,null,null);
  else
    update public.instructor_offers set status='declined',responded_at=now() where id=o.id;
    perform public.write_audit('offer.dates_rejected','instructor_offer',o.id::text,null,null);
    perform public.advance_instructor_offer(r.id);
  end if;
end $$;

revoke execute on function public.suggest_instructor_dates(uuid,jsonb) from public,anon;
revoke execute on function public.read_my_offer_suggestion(uuid) from public,anon;
revoke execute on function public.respond_to_offer_suggestion(uuid,boolean) from public,anon;
grant execute on function public.suggest_instructor_dates(uuid,jsonb) to authenticated;
grant execute on function public.read_my_offer_suggestion(uuid) to authenticated;
grant execute on function public.respond_to_offer_suggestion(uuid,boolean) to authenticated;
-- commit removido: pacote usa uma transacao unica


-- ============================================================== 
-- MIGRACAO ORIGINAL: supabase/migrations/20261101000015_lesson_incidents.sql
-- ============================================================== 
-- Phase 7: real operational incidents; no automatic charges, refunds or cancellation.
-- begin removido: pacote usa uma transacao unica
create table public.booking_incidents (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id),
 meeting_id uuid not null references public.booking_meetings(id),
 reported_by uuid not null references public.profiles(id),
 incident_type text not null check(incident_type in ('weather','absence','equipment','safety','other')),
 minutes_done integer not null default 0 check(minutes_done between 0 and 480),
 description text not null check(length(btrim(description)) between 10 and 1000),
 status text not null default 'open' check(status in ('open','reviewing','resolved','rejected')),
 resolution text check(resolution is null or length(resolution) <= 1000),
 reviewed_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz
);
create index booking_incidents_booking_idx on public.booking_incidents(booking_id,created_at desc);
create index booking_incidents_admin_idx on public.booking_incidents(status,created_at desc);
alter table public.booking_incidents enable row level security;
revoke all on public.booking_incidents from public,anon,authenticated;
grant select on public.booking_incidents to authenticated;
create policy incident_participants_read on public.booking_incidents for select to authenticated
 using(public.is_admin() or exists(select 1 from public.bookings b where b.id=booking_id
   and (b.student_id=auth.uid() or b.instructor_id=auth.uid())));

create function public.report_lesson_incident(
  p_booking_id uuid,p_meeting_id uuid,p_type text,p_minutes_done integer,p_description text
) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['student','instructor']::public.app_role[]);
  b public.bookings; m public.booking_meetings; result_id uuid;
begin
  select * into b from public.bookings where id=p_booking_id;
  if b.id is null or b.status not in ('confirmed','completed')
    or (b.student_id<>uid and b.instructor_id is distinct from uid) then
    raise exception 'Booking unavailable' using errcode='42501'; end if;
  select * into m from public.booking_meetings where id=p_meeting_id and booking_id=p_booking_id;
  if m.id is null then raise exception 'Meeting unavailable' using errcode='P0002'; end if;
  if p_type is null or p_type not in ('weather','absence','equipment','safety','other')
    or p_minutes_done is null or p_minutes_done<0 or p_minutes_done>m.minutes
    or p_description is null or length(btrim(p_description)) not between 10 and 1000 then
    raise exception 'Invalid incident details' using errcode='22023'; end if;
  if p_type='absence' and m.starts_at>now() then
    raise exception 'Report absence only after lesson start' using errcode='22023'; end if;
  insert into public.booking_incidents
    (booking_id,meeting_id,reported_by,incident_type,minutes_done,description)
  values(b.id,m.id,uid,p_type,p_minutes_done,btrim(p_description))
  returning id into result_id;
  perform public.write_audit('incident.reported','booking_incident',result_id::text,null,
    jsonb_build_object('booking_id',b.id,'type',p_type));
  return result_id;
end $$;

create function public.review_lesson_incident(p_incident_id uuid,p_status text,p_resolution text)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['admin']::public.app_role[]); old public.booking_incidents;
begin
  if p_status not in ('reviewing','resolved','rejected') or p_status is null
    or length(btrim(coalesce(p_resolution,'')))<5 or length(p_resolution)>1000 then
    raise exception 'Invalid incident resolution' using errcode='22023'; end if;
  select * into old from public.booking_incidents where id=p_incident_id for update;
  if old.id is null then raise exception 'Incident not found' using errcode='P0002'; end if;
  update public.booking_incidents set status=p_status,
    resolution=btrim(p_resolution),reviewed_by=uid,reviewed_at=now() where id=old.id;
  perform public.write_audit('incident.reviewed','booking_incident',old.id::text,
    jsonb_build_object('status',old.status),jsonb_build_object('status',p_status),
    p_resolution);
end $$;
revoke execute on function public.report_lesson_incident(uuid,uuid,text,integer,text) from public,anon;
revoke execute on function public.review_lesson_incident(uuid,text,text) from public,anon;
grant execute on function public.report_lesson_incident(uuid,uuid,text,integer,text) to authenticated;
grant execute on function public.review_lesson_incident(uuid,text,text) to authenticated;
-- commit removido: pacote usa uma transacao unica


-- ============================================================== 
-- MIGRACAO ORIGINAL: supabase/migrations/20261101000016_in_app_notifications.sql
-- ============================================================== 
-- Phase 8: first-party in-app alerts. No push or external messaging yet.
-- begin removido: pacote usa uma transacao unica
create table public.app_notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 category text not null check(category in ('offer','booking','message','incident')),
 title text not null check(length(title) between 1 and 120),
 body text not null default '' check(length(body)<=500),
 href text not null check(length(href) between 1 and 240 and left(href,1)='/'),
 read_at timestamptz,
 created_at timestamptz not null default now()
);
create index notifications_inbox on public.app_notifications(recipient_id,created_at desc);
alter table public.app_notifications enable row level security;
revoke all on public.app_notifications from public,anon,authenticated;
grant select on public.app_notifications to authenticated;
create policy notifications_recipient on public.app_notifications
 for select to authenticated using(recipient_id=auth.uid());

create function public.mark_my_notification_read(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['student','instructor','admin','partner']::public.app_role[]);
begin
  update public.app_notifications set read_at=coalesce(read_at,now())
    where id=p_id and recipient_id=uid;
  if not found then raise exception 'Notification not found' using errcode='P0002'; end if;
end $$;

create function public.notify_offer_transition() returns trigger
language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
  if tg_op='INSERT' then
    insert into public.app_notifications(recipient_id,category,title,body,href)
      values(new.instructor_id,'offer','Nova solicitação de aula',
        'Você tem uma proposta para responder em até 2 minutos.','/instrutor/solicitacao');
  elsif new.status='suggested' and old.status is distinct from 'suggested' then
    select student_id into rid from public.instructor_requests where id=new.request_id;
    insert into public.app_notifications(recipient_id,category,title,body,href)
      values(rid,'offer','Instrutor sugeriu outra data',
        'Analise e aceite ou recuse a nova data proposta.',
        '/aluno/solicitacao/'||new.request_id::text);
  elsif new.status='accepted' and old.status is distinct from 'accepted' then
    select student_id into rid from public.instructor_requests where id=new.request_id;
    insert into public.app_notifications(recipient_id,category,title,body,href)
      values(rid,'offer','Instrutor aceitou a aula',
        'Sua solicitação foi aceita. Acesse para continuar o pagamento.',
        '/aluno/solicitacao/'||new.request_id::text);
  end if;
  return new;
end $$;
create trigger notify_offer after insert or update of status on public.instructor_offers
 for each row execute function public.notify_offer_transition();

create function public.notify_booking_message() returns trigger
language plpgsql security definer set search_path='' as $$
declare b public.bookings; recipient uuid; uri text;
begin
  select * into b from public.bookings where id=new.booking_id;
  if b.id is null then return new; end if;
  recipient:=case when new.sender_id=b.student_id then b.instructor_id else b.student_id end;
  uri:=case when recipient=b.student_id then '/aluno/atendimento/'||b.id::text
       else '/instrutor/atendimento/'||b.id::text end;
  if recipient is not null then
    insert into public.app_notifications(recipient_id,category,title,body,href)
    values(recipient,'message','Nova mensagem sobre sua aula',
      'Uma nova mensagem chegou na conversa da reserva.',uri);
  end if;
  return new;
end $$;
create trigger notify_message after insert on public.booking_messages
 for each row execute function public.notify_booking_message();

create function public.notify_confirmed_booking() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='confirmed' and old.status is distinct from 'confirmed' then
    if new.instructor_id is not null then
      insert into public.app_notifications(recipient_id,category,title,body,href)
        values(new.instructor_id,'booking','Pagamento confirmado',
          'O pagamento foi confirmado. A aula aparece na sua agenda.','/instrutor/agenda');
    end if;
    insert into public.app_notifications(recipient_id,category,title,body,href)
      values(new.student_id,'booking','Aula confirmada',
        'Confira sua reserva e as próximas instruções.','/aluno/reserva/'||new.id::text);
  end if;
  return new;
end $$;
create trigger notify_booking after update of status on public.bookings
 for each row execute function public.notify_confirmed_booking();

create function public.notify_lesson_incident() returns trigger
language plpgsql security definer set search_path='' as $$
declare b public.bookings; recipient uuid;
begin
  select * into b from public.bookings where id=new.booking_id;
  recipient:=case when new.reported_by=b.student_id then b.instructor_id else b.student_id end;
  if recipient is not null then
    insert into public.app_notifications(recipient_id,category,title,body,href)
    values(recipient,'incident','Imprevisto registrado',
      'Foi registrado um relato sobre um dos seus encontros.',
      case when recipient=b.student_id then '/aluno/ocorrencias'
           else '/instrutor/ocorrencias' end);
  end if;
  return new;
end $$;
create trigger notify_incident after insert on public.booking_incidents
 for each row execute function public.notify_lesson_incident();

revoke execute on function public.mark_my_notification_read(uuid) from public,anon;
grant execute on function public.mark_my_notification_read(uuid) to authenticated;
-- commit removido: pacote usa uma transacao unica


-- ============================================================== 
-- MIGRACAO ORIGINAL: supabase/migrations/20261101000017_instructor_documents.sql
-- ============================================================== 
-- Phase 9: private instructor documentation and audited admin review.
-- begin removido: pacote usa uma transacao unica
create table public.instructor_documents (
 id uuid primary key default gen_random_uuid(),
 instructor_id uuid not null references public.instructors(id) on delete cascade,
 kind text not null check(kind in ('identity','certification','insurance','other')),
 storage_path text not null unique,
 original_name text not null check(length(original_name) between 1 and 180),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 review_notes text,
 reviewed_by uuid references public.profiles(id),
 reviewed_at timestamptz,
 uploaded_at timestamptz not null default now()
);
create index instructor_documents_idx on public.instructor_documents(instructor_id,uploaded_at desc);
alter table public.instructor_documents enable row level security;
revoke all on public.instructor_documents from public,anon,authenticated;
grant select on public.instructor_documents to authenticated;
create policy documents_private_read on public.instructor_documents for select to authenticated
 using(instructor_id=auth.uid() or public.is_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('vento-instructor-documents','vento-instructor-documents',false,8388608,
  array['application/pdf','image/jpeg','image/png'])
on conflict(id) do nothing;
drop policy if exists vento_documents_read on storage.objects;
create policy vento_documents_read on storage.objects for select to authenticated using(
 bucket_id='vento-instructor-documents' and
 ((storage.foldername(name))[1]=(select auth.uid())::text or public.is_admin())
);
drop policy if exists vento_documents_insert on storage.objects;
create policy vento_documents_insert on storage.objects for insert to authenticated with check(
 bucket_id='vento-instructor-documents' and
 (storage.foldername(name))[1]=(select auth.uid())::text
);

create function public.register_my_document(
 p_kind text,p_path text,p_original_name text
) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['instructor']::public.app_role[]); rid uuid;
begin
 if p_kind not in ('identity','certification','insurance','other') or p_kind is null
    or p_path is null or p_path !~ ('^'||uid::text||'/[a-f0-9-]{36}\.(jpg|png|pdf)$')
    or p_original_name is null or length(p_original_name) not between 1 and 180 then
   raise exception 'Invalid document metadata' using errcode='22023'; end if;
 if not exists(select 1 from storage.objects o
   where o.bucket_id='vento-instructor-documents' and o.name=p_path) then
   raise exception 'Document upload not found' using errcode='P0002'; end if;
 insert into public.instructor_documents(instructor_id,kind,storage_path,original_name)
 values(uid,p_kind,p_path,p_original_name) returning id into rid;
 perform public.write_audit('document.uploaded','instructor_document',rid::text,null,
   jsonb_build_object('kind',p_kind,'instructor',uid));
 return rid;
end $$;

create function public.review_instructor_document(
 p_document_id uuid,p_status text,p_notes text
) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['admin']::public.app_role[]);
  original public.instructor_documents;
begin
 if p_status not in ('approved','rejected') or p_status is null
    or length(coalesce(p_notes,''))>1000
    or (p_status='rejected' and length(btrim(coalesce(p_notes,'')))<5) then
   raise exception 'Invalid document decision' using errcode='22023'; end if;
 select * into original from public.instructor_documents where id=p_document_id for update;
 if original.id is null then raise exception 'Document not found' using errcode='P0002'; end if;
 update public.instructor_documents
 set status=p_status,review_notes=nullif(btrim(coalesce(p_notes,'')),''),
   reviewed_by=uid,reviewed_at=now()
 where id=original.id;
 perform public.write_audit('document.reviewed','instructor_document',p_document_id::text,
   jsonb_build_object('status',original.status),jsonb_build_object('status',p_status),p_notes);
end $$;

revoke execute on function public.register_my_document(text,text,text) from public,anon;
revoke execute on function public.review_instructor_document(uuid,text,text) from public,anon;
grant execute on function public.register_my_document(text,text,text) to authenticated;
grant execute on function public.review_instructor_document(uuid,text,text) to authenticated;
-- commit removido: pacote usa uma transacao unica


-- ============================================================== 
-- MIGRACAO ORIGINAL: supabase/migrations/20261101000018_approval_document_gate.sql
-- ============================================================== 
-- Phase 10: require verified identity and certification for new instructor approval.
-- Existing active instructors remain approved, prior approval can resume.
-- begin removido: pacote usa uma transacao unica
create or replace function public.set_instructor_status(p_instructor_id uuid, p_status public.instructor_status, p_reason text)
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

  -- First-time activation requires administrator-reviewed identity and
  -- professional qualification. Resume an already-approved teacher normally.
  if p_status = 'approved' and i.approved_at is null then
    if not exists(select 1 from public.instructor_documents d
      where d.instructor_id=i.id and d.kind='identity' and d.status='approved')
      or not exists(select 1 from public.instructor_documents d
      where d.instructor_id=i.id and d.kind='certification' and d.status='approved')
    then raise exception 'Instructor documents must be approved before activation'
      using errcode='55000'; end if;
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
-- commit removido: pacote usa uma transacao unica


-- ============================================================== 
-- MIGRACAO ORIGINAL: supabase/migrations/20261101000019_meeting_points.sql
-- ============================================================== 
-- Phase 11: verified meeting places managed by Admin and assigned by the instructor.
-- begin removido: pacote usa uma transacao unica
create table public.meeting_points (
 id uuid primary key default gen_random_uuid(),
 beach_id uuid not null references public.beaches(id),
 title text not null check(length(btrim(title)) between 2 and 100),
 details text not null default '' check(length(details)<=400),
 latitude numeric(9,6) not null check(latitude between -90 and 90),
 longitude numeric(9,6) not null check(longitude between -180 and 180),
 active boolean not null default true,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
create index meeting_points_beach_idx on public.meeting_points(beach_id,active);
alter table public.bookings add column meeting_point_id uuid references public.meeting_points(id);
alter table public.meeting_points enable row level security;
revoke all on public.meeting_points from public,anon,authenticated;
grant select on public.meeting_points to authenticated;
create policy meeting_points_authenticated_read on public.meeting_points
 for select to authenticated using(true);

create function public.create_meeting_point(
 p_beach_id uuid,p_title text,p_details text,p_latitude numeric,p_longitude numeric
) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['admin']::public.app_role[]); result_id uuid;
begin
 if p_beach_id is null or not exists(select 1 from public.beaches
       where id=p_beach_id and active)
   or p_title is null or length(btrim(p_title)) not between 2 and 100
   or length(coalesce(p_details,''))>400 or p_latitude not between -90 and 90
   or p_longitude not between -180 and 180 or p_latitude is null or p_longitude is null then
   raise exception 'Invalid meeting point' using errcode='22023'; end if;
 insert into public.meeting_points(beach_id,title,details,latitude,longitude,created_by)
   values(p_beach_id,btrim(p_title),btrim(coalesce(p_details,'')),p_latitude,p_longitude,uid)
 returning id into result_id;
 perform public.write_audit('meeting_point.created','meeting_point',result_id::text,null,
   jsonb_build_object('beach_id',p_beach_id,'title',p_title));
 return result_id;
end $$;

create function public.set_meeting_point_active(p_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.require_role(array['admin']::public.app_role[]);
 update public.meeting_points set active=coalesce(p_active,false) where id=p_id;
 if not found then raise exception 'Meeting point not found' using errcode='P0002'; end if;
 perform public.write_audit('meeting_point.status_changed','meeting_point',p_id::text,null,
   jsonb_build_object('active',p_active));
end $$;

create function public.assign_booking_meeting_point(p_booking_id uuid,p_meeting_point_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['instructor']::public.app_role[]);
  b public.bookings; p public.meeting_points;
begin
 select * into b from public.bookings where id=p_booking_id for update;
 if b.id is null or b.instructor_id is distinct from uid or b.status<>'confirmed' then
   raise exception 'Booking cannot be updated' using errcode='42501'; end if;
 if exists(select 1 from public.booking_meetings where booking_id=b.id
   and status<>'scheduled') then
   raise exception 'Cannot change meeting point after starting a lesson' using errcode='55000'; end if;
 select * into p from public.meeting_points where id=p_meeting_point_id;
 if p.id is null or p.beach_id<>b.beach_id or not p.active then
   raise exception 'Point must belong to the booking beach' using errcode='22023'; end if;
 update public.bookings set meeting_point_id=p.id where id=b.id;
 perform public.write_audit('booking.meeting_point_set','booking',b.id::text,null,
   jsonb_build_object('meeting_point_id',p.id));
end $$;

revoke execute on function public.create_meeting_point(uuid,text,text,numeric,numeric) from public,anon;
revoke execute on function public.set_meeting_point_active(uuid,boolean) from public,anon;
revoke execute on function public.assign_booking_meeting_point(uuid,uuid) from public,anon;
grant execute on function public.create_meeting_point(uuid,text,text,numeric,numeric) to authenticated;
grant execute on function public.set_meeting_point_active(uuid,boolean) to authenticated;
grant execute on function public.assign_booking_meeting_point(uuid,uuid) to authenticated;
-- commit removido: pacote usa uma transacao unica

COMMIT;
