-- P0 #92: preferred instructor must obey the same availability/overlap guard.
-- Non-destructive CREATE OR REPLACE; preserve SECURITY DEFINER and grants.
-- Review and run isolated CI before considering production migration.
CREATE OR REPLACE FUNCTION public.advance_instructor_offer(p_request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    where request_id=r.id
      and status in ('offered','suggested')
      and expires_at<=now();

  select id into v_offer from public.instructor_offers
    where request_id=r.id
      and status in ('offered','suggested')
      and expires_at>now() limit 1;
  if v_offer is not null then return v_offer; end if;

  for i in
    select ins.id from public.instructors ins
    where ins.status='approved'
      and exists(
        select 1 from public.instructor_beaches ib
        where ib.instructor_id=ins.id and ib.beach_id=r.beach_id
      )
      and r.language=any(ins.languages)
      and (not r.with_transport or ins.has_support_vehicle)
      and not exists(
        select 1 from public.instructor_offers previous
        where previous.request_id=r.id and previous.instructor_id=ins.id
      )
    order by case when ins.id=r.preferred_instructor_id then 0 else 1 end,
      ins.queue_position nulls last,ins.id
    for update of ins skip locked
  loop
    if not public.instructor_can_attend(i.id,r.meetings)
    then continue; end if;

    select exists (
      select 1 from public.instructor_offers o
      join public.instructor_requests other on other.id=o.request_id
      cross join lateral jsonb_array_elements(other.meetings) existing_meeting
      cross join lateral jsonb_array_elements(r.meetings) proposed_meeting
      where o.instructor_id=i.id and o.status='offered' and o.expires_at>now()
        and other.status='searching' and other.id<>r.id
        and tstzrange(
          (existing_meeting->>'starts_at')::timestamptz,
          (existing_meeting->>'starts_at')::timestamptz
            + make_interval(hours=>(existing_meeting->>'hours')::integer),'[)'
        )
        && tstzrange(
          (proposed_meeting->>'starts_at')::timestamptz,
          (proposed_meeting->>'starts_at')::timestamptz
            + make_interval(hours=>(proposed_meeting->>'hours')::integer),'[)'
        )
    ) into v_busy;
    if v_busy then continue; end if;

    insert into public.instructor_offers(request_id,instructor_id,expires_at)
      values(r.id,i.id,least(now()+interval '2 minutes',r.expires_at))
      returning id into v_offer;

    perform public.write_audit(
      'offer.sent','instructor_offer',v_offer::text,null,
      jsonb_build_object('request',r.id,'instructor',i.id)
    );
    return v_offer;
  end loop;
  return null;
end $function$
;
