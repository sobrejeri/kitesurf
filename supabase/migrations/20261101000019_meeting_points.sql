-- Phase 11: verified meeting places managed by Admin and assigned by the instructor.
begin;
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
commit;
