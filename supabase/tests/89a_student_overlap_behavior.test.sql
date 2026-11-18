-- P0 #90/#91: behavioral regression, not merely trigger catalog inspection.
-- Runs only in disposable PostgreSQL via scripts/test-db.sh.
-- All fixture mutations are rolled back, including cancelled-meeting changes.
\set ON_ERROR_STOP on
begin;
do $$
declare
  v_booking uuid;
  v_first uuid;
  v_second uuid;
  v_start timestamptz;
  v_original timestamptz;
  v_rejected boolean := false;
begin
  select b.id into v_booking
  from public.bookings b
  where b.student_id = '00000000-0000-0000-0000-0000000000b1'::uuid
    and b.status::text = 'confirmed'
    and (select count(*) from public.booking_meetings m where m.booking_id=b.id) >= 2
  order by b.created_at, b.id limit 1;
  if v_booking is null then
    raise exception 'P0 fixture missing: confirmed booking with two meetings';
  end if;
  select id, starts_at into v_first, v_start
  from public.booking_meetings where booking_id=v_booking
  order by position limit 1;
  select id, starts_at into v_second, v_original
  from public.booking_meetings where booking_id=v_booking
  order by position offset 1 limit 1;
  if v_first = v_second or v_start = v_original then
    raise exception 'P0 fixture must have distinct meetings and times';
  end if;

  -- Same student, same booking, two active meetings: must reject the UPDATE.
  begin
    update public.booking_meetings set starts_at=v_start where id=v_second;
  exception when exclusion_violation then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'P0: active overlapping meetings were accepted';
  end if;
  if (select starts_at from public.booking_meetings where id=v_second)
       is distinct from v_original then
    raise exception 'P0: rejected overlap modified the stored meeting';
  end if;

  -- Cancelled meetings are not active; editing their time must remain possible.
  update public.booking_meetings set status='cancelled' where id=v_second;
  update public.booking_meetings set starts_at=v_start where id=v_second;
  if (select starts_at from public.booking_meetings where id=v_second)
       is distinct from v_start then
    raise exception 'P0: cancelled meeting edit did not persist within transaction';
  end if;

  -- Reactivating a cancelled overlapping meeting must fail again.
  v_rejected := false;
  begin
    update public.booking_meetings set status='scheduled' where id=v_second;
  exception when exclusion_violation then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'P0: reactivation bypassed overlap protection';
  end if;
  if (select status::text from public.booking_meetings where id=v_second) <> 'cancelled' then
    raise exception 'P0: rejected reactivation changed meeting status';
  end if;
end $$;
rollback;
select 'PASS: student meeting overlap rejection, cancelled exemption and reactivation guard' as result;
