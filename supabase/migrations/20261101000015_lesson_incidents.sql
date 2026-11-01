-- Phase 7: real operational incidents; no automatic charges, refunds or cancellation.
begin;
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
commit;
