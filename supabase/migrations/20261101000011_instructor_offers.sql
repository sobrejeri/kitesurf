-- Phase 4: offers before payment, preserving all legacy bookings.
-- Requests live separately; a booking is only created after the instructor accepts.
-- Offer lifetime: 2 minutes. Search lifetime: 6 minutes. Checkout: 10 minutes.
begin;

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
commit;
