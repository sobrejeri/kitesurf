-- VENTO | Migration 29 | Admin demo booking with 1-4 meetings.
-- Requires Migration 20. Preserve existing single-meeting RPC.
-- No charge, payment attempt or payout is created for these bookings.
BEGIN;

CREATE FUNCTION public.create_admin_test_booking(
  p_instructor_id uuid,
  p_student_id uuid,
  p_beach_id uuid,
  p_meetings jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_admin uuid := public.require_role(ARRAY['admin']::public.app_role[]);
  v_instructor public.instructors;
  v_price public.price_versions := public.current_price_version();
  v_split record;
  v_booking_id uuid;
  v_code text;
  v_meeting jsonb;
  v_previous jsonb;
  v_start timestamptz;
  v_end timestamptz;
  v_hours integer;
  v_total_hours integer := 0;
  v_position integer := 0;
  v_lesson_cents integer;
BEGIN
  IF p_instructor_id IS NULL OR p_student_id IS NULL OR p_beach_id IS NULL
    OR p_instructor_id = p_student_id
    OR NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id=p_student_id AND p.role='student'
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.beaches b
      WHERE b.id=p_beach_id AND b.active
    )
    OR p_meetings IS NULL
    OR jsonb_typeof(p_meetings) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_meetings) NOT BETWEEN 1 AND 4
  THEN
    RAISE EXCEPTION 'Invalid demo booking parameters'
      USING errcode='22023';
  END IF;

  -- Lock during creation to serialize bookings for the same instructor.
  SELECT * INTO v_instructor
  FROM public.instructors
  WHERE id=p_instructor_id FOR UPDATE;

  IF v_instructor.id IS NULL OR v_instructor.status <> 'approved' THEN
    RAISE EXCEPTION 'An approved instructor is required'
      USING errcode='22023';
  END IF;
  IF v_price.id IS NULL THEN
    RAISE EXCEPTION 'A published price is required'
      USING errcode='P0002';
  END IF;

  -- Validate every meeting, including conflicts WITHIN the new request.
  FOR v_meeting IN
    SELECT value FROM jsonb_array_elements(p_meetings)
  LOOP
    IF jsonb_typeof(v_meeting) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_meeting->'starts_at') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_meeting->'hours') IS DISTINCT FROM 'number'
      OR (v_meeting->>'hours') !~ '^[1-8]$'
      OR (v_meeting->>'starts_at') !~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}-03:00$'
    THEN
      RAISE EXCEPTION 'Invalid meeting date or duration'
        USING errcode='22023';
    END IF;

    v_start := (v_meeting->>'starts_at')::timestamptz;
    v_hours := (v_meeting->>'hours')::integer;
    v_end := v_start + make_interval(hours => v_hours);
    IF v_start < now()+interval '1 hour'
      OR v_start > now()+interval '60 days'
    THEN
      RAISE EXCEPTION 'Meeting must be 1 hour to 60 days in advance'
        USING errcode='22023';
    END IF;
    v_total_hours := v_total_hours + v_hours;
    IF v_total_hours > 8 THEN
      RAISE EXCEPTION 'Maximum 8 hours per demo reservation'
        USING errcode='22023';
    END IF;

    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_meetings) other
      WHERE (other.value->>'starts_at') IS NOT NULL
        AND other.value <> v_meeting
        AND (other.value->>'starts_at') ~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}-03:00$'
        AND (other.value->>'hours') ~ '^[1-8]$'
        AND tstzrange(v_start,v_end,'[)') &&
          tstzrange(
            (other.value->>'starts_at')::timestamptz,
            (other.value->>'starts_at')::timestamptz
              + make_interval(hours => (other.value->>'hours')::integer),
            '[)'
          )
    ) THEN
      RAISE EXCEPTION 'Demo meetings cannot overlap each other'
        USING errcode='55000';
    END IF;
  END LOOP;

  -- Exact duplicate JSON objects are also overlaps (they have equality).
  IF (
    SELECT count(*) FROM jsonb_array_elements(p_meetings)
  ) <> (
    SELECT count(DISTINCT item.value)
    FROM jsonb_array_elements(p_meetings) AS item
  ) THEN
    RAISE EXCEPTION 'Duplicate demo meetings'
      USING errcode='55000';
  END IF;

  -- Weekly availability, time off and existing booking conflicts.
  IF NOT public.instructor_can_attend(v_instructor.id,p_meetings) THEN
    RAISE EXCEPTION 'Instructor has a class or block at a selected time'
      USING errcode='55000';
  END IF;

  v_lesson_cents := v_total_hours * v_price.hourly_rate_cents;
  SELECT * INTO v_split
  FROM public.split_total(v_lesson_cents,v_price.platform_commission_bps,0);

  v_code := 'VNT-TEST-'||nextval('public.booking_code_seq');
  INSERT INTO public.bookings (
    code,student_id,instructor_id,price_version_id,beach_id,level,language,
    total_hours,hourly_rate_cents,with_transport,transport_hourly_cents,
    transport_cents,total_cents,partner_cents,platform_cents,
    instructor_net_cents,presence_code,status,confirmed_at,is_test
  ) VALUES (
    v_code,p_student_id,p_instructor_id,v_price.id,p_beach_id,'first_time',
    coalesce(nullif(v_instructor.languages[1],''),'Português'),
    v_total_hours,v_price.hourly_rate_cents,false,0,0,v_lesson_cents,
    0,v_split.platform_cents,v_split.instructor_net_cents,
    lpad(floor(random()*10000)::integer::text,4,'0'),
    'confirmed',now(),true
  ) RETURNING id INTO v_booking_id;

  -- Sequence order is chronological, independent of form entry order.
  FOR v_meeting IN
    SELECT value FROM jsonb_array_elements(p_meetings)
    ORDER BY (value->>'starts_at')::timestamptz
  LOOP
    v_position := v_position + 1;
    INSERT INTO public.booking_meetings(
      booking_id,position,starts_at,minutes
    ) VALUES (
      v_booking_id,v_position,
      (v_meeting->>'starts_at')::timestamptz,
      (v_meeting->>'hours')::integer*60
    );
  END LOOP;

  PERFORM public.write_audit(
    'booking.test_created','booking',v_booking_id::text,NULL,
    jsonb_build_object(
      'code',v_code,'instructor',p_instructor_id,'student',p_student_id,
      'meeting_count',v_position,'total_hours',v_total_hours
    ),
    'Reserva demonstrativa multi-encontros criada pelo Admin; sem pagamento'
  );

  INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
  VALUES (
    p_instructor_id,'booking','Reserva teste com encontros agendados',
    'Consulte os encontros da reserva demonstrativa na agenda. Não há pagamento.',
    '/instrutor/agenda'
  );

  RETURN v_booking_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_admin_test_booking(
  uuid,uuid,uuid,jsonb
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_admin_test_booking(
  uuid,uuid,uuid,jsonb
) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;