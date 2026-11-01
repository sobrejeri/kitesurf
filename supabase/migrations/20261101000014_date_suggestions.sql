-- Phase 6: instructors can propose alternative meeting dates; students approve
-- changes explicitly. No charge or financial snapshot changes before acceptance.
begin;
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
commit;
