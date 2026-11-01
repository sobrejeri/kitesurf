-- Phase 5: request a previous instructor again, with queue fallback.
-- A preference is authorized by an earlier confirmed/completed booking.
begin;
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
commit;
