-- Instructor feedback: one verified student review per completed booking.
begin;
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
commit;
