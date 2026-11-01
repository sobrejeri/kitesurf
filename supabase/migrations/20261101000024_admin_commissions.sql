-- Vento: admin-configurable instructor platform fee and partner referral commission.
-- Applied only to future bookings, whose monetary split remains frozen.
-- Requires previous migrations (especially 10, 22 and 23). Backup first.
BEGIN;

-- Instructor-specific commission is an optional override. A missing row
-- means use the global commission from the latest immutable price version.
-- Never add this private negotiated commission to the public instructors table.
CREATE TABLE public.instructor_commission_overrides (
  instructor_id uuid PRIMARY KEY REFERENCES public.instructors(id) ON DELETE CASCADE,
  commission_bps integer NOT NULL CHECK (commission_bps BETWEEN 0 AND 10000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.instructor_commission_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instructor_commission_overrides FROM anon, authenticated;
GRANT SELECT ON public.instructor_commission_overrides TO authenticated;
CREATE POLICY instructor_commission_read
  ON public.instructor_commission_overrides
  FOR SELECT TO authenticated
  USING (instructor_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

-- Only an admin RPC may change the override. NULL resets to the global rate.
CREATE FUNCTION public.set_instructor_commission(
  p_instructor_id uuid, p_commission_bps integer, p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  previous_bps integer;
BEGIN
  PERFORM public.require_role(ARRAY['admin']::public.app_role[]);
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 500
    OR (p_commission_bps IS NOT NULL AND
        p_commission_bps NOT BETWEEN 0 AND 10000) THEN
    RAISE EXCEPTION 'Invalid commission or audit reason'
      USING errcode='22023';
  END IF;
  -- Serialize changes against other operations involving this instructor.
  PERFORM 1 FROM public.instructors WHERE id=p_instructor_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instructor not found' USING errcode='P0002';
  END IF;
  SELECT o.commission_bps INTO previous_bps
    FROM public.instructor_commission_overrides o
    WHERE o.instructor_id=p_instructor_id;
  IF p_commission_bps IS NULL THEN
    DELETE FROM public.instructor_commission_overrides o
      WHERE o.instructor_id=p_instructor_id;
  ELSE
    INSERT INTO public.instructor_commission_overrides (
      instructor_id, commission_bps
    ) VALUES (p_instructor_id, p_commission_bps)
    ON CONFLICT (instructor_id) DO UPDATE SET
      commission_bps=excluded.commission_bps,
      updated_at=now();
  END IF;
  PERFORM public.write_audit(
    'instructor.commission_changed','instructor',p_instructor_id::text,
    jsonb_build_object('commission_bps_override',previous_bps),
    jsonb_build_object('commission_bps_override',p_commission_bps),
    p_reason
  );
END;
$$;

-- Partner commission was already stored in partners.commission_bps, initially
-- 500 (5%). Never change the affiliate code, approval or prior bookings here.
CREATE FUNCTION public.set_partner_commission(
  p_partner_id uuid, p_commission_bps integer, p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  previous_bps integer;
BEGIN
  PERFORM public.require_role(ARRAY['admin']::public.app_role[]);
  IF p_commission_bps IS NULL OR p_commission_bps NOT BETWEEN 0 AND 5000
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Invalid commission or audit reason'
      USING errcode='22023';
  END IF;
  SELECT p.commission_bps INTO previous_bps
    FROM public.partners p WHERE p.id=p_partner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partner not found' USING errcode='P0002';
  END IF;
  UPDATE public.partners p SET commission_bps=p_commission_bps
    WHERE p.id=p_partner_id;
  PERFORM public.write_audit(
    'partner.commission_changed','partner',p_partner_id::text,
    jsonb_build_object('commission_bps',previous_bps),
    jsonb_build_object('commission_bps',p_commission_bps),
    p_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_instructor_commission(uuid,integer,text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_partner_commission(uuid,integer,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_instructor_commission(uuid,integer,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_partner_commission(uuid,integer,text)
  TO authenticated;

-- Re-issue the latest booking function; only its commission lookup/split and
-- audit metadata change. This deliberately preserves first-paid affiliate
-- attribution, queue, conflict detection, support vehicle and payment rules.

create or replace function public.create_booking(
  p_beach_id uuid,
  p_level public.lesson_level,
  p_language text,
  p_meetings jsonb,
  p_partner_code text default null,
  p_with_transport boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_role(array['student']::public.app_role[]);
  price public.price_versions := public.current_price_version();
  with_transport boolean := coalesce(p_with_transport, false);
  meeting jsonb;
  total_hours integer := 0;
  meeting_count integer;
  partner public.partners;
  chosen_instructor uuid;
  effective_platform_bps integer;
  split record;
  lesson_cents integer;
  v_transport_cents integer;
  booking_id uuid;
  booking_code text;
  pos integer := 0;
begin
  if price.id is null then
    raise exception 'No price published' using errcode = 'P0002';
  end if;
  if with_transport and price.transport_hourly_cents <= 0 then
    raise exception 'Support vehicle not available' using errcode = '22023';
  end if;
  if not exists (select 1 from public.beaches where id = p_beach_id and active) then
    raise exception 'Unknown or inactive beach' using errcode = '22023';
  end if;
  if p_language is null or char_length(p_language) > 40 then
    raise exception 'Invalid language' using errcode = '22023';
  end if;
  if jsonb_typeof(p_meetings) <> 'array' then
    raise exception 'Meetings must be a list' using errcode = '22023';
  end if;
  meeting_count := jsonb_array_length(p_meetings);
  if meeting_count < 1 or meeting_count > 8 then
    raise exception 'Between 1 and 8 meetings' using errcode = '22023';
  end if;

  for meeting in select * from jsonb_array_elements(p_meetings) loop
    if (meeting ->> 'hours')::integer not between 1 and 8 then
      raise exception 'Each meeting lasts 1 to 8 hours' using errcode = '22023';
    end if;
    if (meeting ->> 'starts_at')::timestamptz < now() + interval '1 hour' then
      raise exception 'Meetings must start at least one hour from now' using errcode = '22023';
    end if;
    total_hours := total_hours + (meeting ->> 'hours')::integer;
  end loop;
  if total_hours > 8 then
    raise exception 'At most 8 hours per booking' using errcode = '22023';
  end if;

  -- Close holds older than ten minutes; preserve booking history.
  update public.bookings set status='cancelled', cancelled_at=now()
  where status='awaiting_payment' and created_at < now()-interval '10 minutes';

  if exists (
    select 1 from jsonb_array_elements(p_meetings) with ordinality a(m,n)
    join jsonb_array_elements(p_meetings) with ordinality b(m,n) on a.n<b.n
    where tstzrange((a.m->>'starts_at')::timestamptz,
      (a.m->>'starts_at')::timestamptz+make_interval(hours=>(a.m->>'hours')::integer),'[)')
       && tstzrange((b.m->>'starts_at')::timestamptz,
      (b.m->>'starts_at')::timestamptz+make_interval(hours=>(b.m->>'hours')::integer),'[)')
  ) then raise exception 'Overlapping meetings' using errcode='22023'; end if;

  if p_partner_code is not null and p_partner_code <> '' then
    select * into partner from public.partners
    where code = upper(p_partner_code) and status = 'approved';
  end if;

  -- Affiliate attribution belongs exclusively to the student's FIRST paid
  -- contract, irrespective of the referral link used for subsequent orders.
  if exists (select 1 from public.bookings paid
     where paid.student_id=uid and paid.status in ('confirmed','completed')) then
    partner := null;
  end if;

  select i.id into chosen_instructor
  from public.instructors i
  where i.status = 'approved'
    and exists (select 1 from public.instructor_beaches ib where ib.instructor_id = i.id and ib.beach_id = p_beach_id)
    and p_language = any (i.languages)
    and (not with_transport or i.has_support_vehicle)
    and i.id <> uid
    and public.instructor_can_attend(i.id,p_meetings)
    and not exists (
      select 1
      from jsonb_array_elements(p_meetings) m
      join public.booking_meetings bm on true
      join public.bookings b on b.id = bm.booking_id
      where b.instructor_id = i.id
        and (b.status='confirmed' or
          (b.status='awaiting_payment' and b.created_at >= now()-interval '10 minutes'))
        and bm.status <> 'cancelled'
        and tstzrange(bm.starts_at, bm.starts_at + make_interval(mins => bm.minutes))
            && tstzrange((m ->> 'starts_at')::timestamptz,
                         (m ->> 'starts_at')::timestamptz + make_interval(hours => (m ->> 'hours')::integer))
    )
  order by i.queue_position
  limit 1
  for update of i skip locked;

  if chosen_instructor is null then
    raise exception 'No instructor available for these slots' using errcode = 'P0001', hint = 'NO_INSTRUCTOR';
  end if;

  lesson_cents := total_hours * price.hourly_rate_cents;
  v_transport_cents := case when with_transport then total_hours * price.transport_hourly_cents else 0 end;
  -- Only the lesson bears a commission; transport is fully instructor-owned.
  -- An individual instructor override takes precedence over the published
  -- global platform rate. The split is frozen when the booking is created.
  select coalesce(
    (select ico.commission_bps from public.instructor_commission_overrides ico
      where ico.instructor_id = chosen_instructor),
    price.platform_commission_bps
  ) into effective_platform_bps;
  select * into split from public.split_total(
    lesson_cents, effective_platform_bps, partner.commission_bps
  );

  booking_code := 'VNT-' || nextval('public.booking_code_seq');

  insert into public.bookings (
    code, student_id, instructor_id, partner_id, price_version_id, beach_id, level, language,
    total_hours, hourly_rate_cents, with_transport, transport_hourly_cents, transport_cents,
    total_cents, partner_cents, platform_cents, instructor_net_cents, presence_code
  ) values (
    booking_code, uid, chosen_instructor, partner.id, price.id, p_beach_id, p_level, p_language,
    total_hours, price.hourly_rate_cents, with_transport,
    case when with_transport then price.transport_hourly_cents else 0 end, v_transport_cents,
    lesson_cents + v_transport_cents, split.partner_cents, split.platform_cents,
    split.instructor_net_cents + v_transport_cents,
    lpad((floor(random() * 10000))::integer::text, 4, '0')
  ) returning id into booking_id;

  for meeting in
    select value from jsonb_array_elements(p_meetings) order by (value ->> 'starts_at')::timestamptz
  loop
    pos := pos + 1;
    insert into public.booking_meetings (booking_id, position, starts_at, minutes)
    values (booking_id, pos, (meeting ->> 'starts_at')::timestamptz, (meeting ->> 'hours')::integer * 60);
  end loop;

  perform public.write_audit('booking.created', 'booking', booking_id::text, null,
    jsonb_build_object('code', booking_code, 'instructor_id', chosen_instructor, 'beach_id', p_beach_id,
      'with_transport', with_transport, 'total_cents', lesson_cents + v_transport_cents,
      'price_version_id', price.id,
      'applied_platform_commission_bps', effective_platform_bps,
      'requested_partner_commission_bps', coalesce(partner.commission_bps, 0)));


  return booking_id;
end;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
