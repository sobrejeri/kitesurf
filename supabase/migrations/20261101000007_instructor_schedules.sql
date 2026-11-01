-- Stage 1: real instructor schedules, time blocks and anti-double booking.
-- Existing instructors remain unrestricted UNTIL they save a weekly schedule.
begin;
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
commit;
