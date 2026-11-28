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
  v_bookings_before bigint;
  v_meetings_before bigint;
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

  -- The seeded booking may be in the past relative to CI execution. Move only
  -- these disposable test rows into a future booking window so create_booking
  -- reaches the overlap guard instead of failing its minimum-start validation.
  -- The enclosing transaction is rolled back at the end of this test.
  v_start := date_trunc('day', now() + interval '14 days') + interval '12 hours';
  v_original := v_start + interval '2 days';
  update public.booking_meetings set starts_at=v_start where id=v_first;
  update public.booking_meetings set starts_at=v_original where id=v_second;

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

  -- A second booking for the SAME student must also be rejected, even when
  -- another approved instructor is free. This is the cross-booking regression
  -- missing from the same-booking trigger test.
  v_rejected := false;
  -- A failed booking RPC must not leave an orphan booking or meeting, even
  -- if its exception is caught by this regression test.
  select count(*) into v_bookings_before from public.bookings;
  select count(*) into v_meetings_before from public.booking_meetings;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  execute 'SET LOCAL ROLE authenticated';
  begin
    perform public.create_booking(
      (select id from public.beaches where slug = 'prea'),
      'first_time', 'Português',
      jsonb_build_array(jsonb_build_object('starts_at', v_start::text, 'hours', 2))
    );
  exception when exclusion_violation then
    v_rejected := true;
  end;
  execute 'RESET ROLE';
  if not v_rejected then
    raise exception 'P0: second booking accepted an overlapping student meeting';
  end if;
  if (select count(*) from public.bookings) <> v_bookings_before
     or (select count(*) from public.booking_meetings) <> v_meetings_before then
    raise exception 'P0: rejected second booking persisted orphan booking/meeting rows';
  end if;
  if (select count(*) from public.booking_meetings m
      join public.bookings b on b.id=m.booking_id
      where b.student_id='00000000-0000-0000-0000-0000000000b1'::uuid
        and m.starts_at=v_start and m.status::text <> 'cancelled') <> 1 then
    raise exception 'P0: failed second booking left overlapping meeting data';
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
