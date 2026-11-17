-- P0 #90/#91: prevent a student from holding overlapping active meetings
-- with different instructors. Additive only; apply AFTER the booking RPC
-- concurrency migrations have been reconciled and tested in isolated PG.
begin;

create or replace function public.guard_student_meeting_overlap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid;
  v_booking_status text;
  v_booking_created timestamptz;
begin
  select b.student_id, b.status::text, b.created_at
    into v_student, v_booking_status, v_booking_created
    from public.bookings b where b.id = new.booking_id;
  if v_student is null then
    raise exception 'Booking student missing' using errcode = '23503';
  end if;

  -- Serialize all meeting changes for one student, regardless of instructor.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('student-meetings:' || v_student::text, 0)
  );

  if v_booking_status not in ('confirmed', 'awaiting_payment')
     or (v_booking_status = 'awaiting_payment'
         and v_booking_created < pg_catalog.now() - interval '10 minutes')
     or new.status::text = 'cancelled' then
    return new;
  end if;

  if exists (
    select 1
      from public.booking_meetings other_m
      join public.bookings other_b on other_b.id = other_m.booking_id
     where other_b.student_id = v_student
       and other_m.id <> new.id
       and other_m.status::text <> 'cancelled'
       and (other_b.status::text = 'confirmed'
         or (other_b.status::text = 'awaiting_payment'
             and other_b.created_at >= pg_catalog.now() - interval '10 minutes'))
       and pg_catalog.tstzrange(
         other_m.starts_at,
         other_m.starts_at + pg_catalog.make_interval(mins => other_m.minutes),
         '[)'
       ) && pg_catalog.tstzrange(
         new.starts_at,
         new.starts_at + pg_catalog.make_interval(mins => new.minutes),
         '[)'
       )
  ) then
    raise exception 'Student already has a meeting in this time slot'
      using errcode = '23P01', hint = 'STUDENT_MEETING_CONFLICT';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_student_meeting_overlap() from public, anon, authenticated;

create trigger guard_student_meeting_overlap_insert_update
after insert or update of starts_at, minutes, status, booking_id
on public.booking_meetings
for each row execute function public.guard_student_meeting_overlap();

-- Recheck when an expired/pending booking is activated by a status transition.
create or replace function public.guard_student_booking_activation()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_meeting record;
begin
  if new.status::text = 'confirmed' and old.status::text <> 'confirmed' then
    for v_meeting in
      select id, starts_at, minutes from public.booking_meetings
      where booking_id = new.id and status::text <> 'cancelled'
    loop
      perform public.guard_student_meeting_overlap_for_activation(
        new.student_id, v_meeting.id, v_meeting.starts_at, v_meeting.minutes
      );
    end loop;
  end if;
  return new;
end;
$$;

create or replace function public.guard_student_meeting_overlap_for_activation(
  p_student uuid, p_meeting uuid, p_starts timestamptz, p_minutes integer
) returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('student-meetings:' || p_student::text, 0)
  );
  if exists (
    select 1 from public.booking_meetings m
    join public.bookings b on b.id = m.booking_id
    where b.student_id = p_student and m.id <> p_meeting
      and m.status::text <> 'cancelled'
      and (b.status::text = 'confirmed'
        or (b.status::text = 'awaiting_payment'
            and b.created_at >= pg_catalog.now() - interval '10 minutes'))
      and pg_catalog.tstzrange(m.starts_at,m.starts_at+pg_catalog.make_interval(mins=>m.minutes),'[)')
          && pg_catalog.tstzrange(p_starts,p_starts+pg_catalog.make_interval(mins=>p_minutes),'[)')
  ) then
    raise exception 'Student already has a meeting in this time slot'
      using errcode = '23P01', hint = 'STUDENT_MEETING_CONFLICT';
  end if;
end;
$$;
revoke all on function public.guard_student_booking_activation() from public, anon, authenticated;
revoke all on function public.guard_student_meeting_overlap_for_activation(uuid,uuid,timestamptz,integer) from public, anon, authenticated;

create trigger guard_student_booking_activation_status
after update of status on public.bookings
for each row execute function public.guard_student_booking_activation();
commit;
