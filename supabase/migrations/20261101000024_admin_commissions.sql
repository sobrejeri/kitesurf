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

-- Do not replace create_booking: its queue, first-paid referral and future
-- features stay intact. Run before the immutable booking snapshot is inserted,
-- only when an instructor has an individual commission override.
CREATE FUNCTION public.apply_instructor_commission_override()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  individual_bps integer;
  affiliate_bps integer := 0;
  lesson_cents integer;
  split record;
BEGIN
  IF NEW.instructor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.commission_bps INTO individual_bps
    FROM public.instructor_commission_overrides o
    WHERE o.instructor_id=NEW.instructor_id;
  IF NOT FOUND THEN
    RETURN NEW; -- no override: preserve the global-rate split
  END IF;

  IF NEW.partner_id IS NOT NULL THEN
    SELECT p.commission_bps INTO affiliate_bps
      FROM public.partners p WHERE p.id=NEW.partner_id;
  END IF;

  lesson_cents := NEW.total_hours * NEW.hourly_rate_cents;
  SELECT * INTO split FROM public.split_total(
    lesson_cents, individual_bps, affiliate_bps
  );
  NEW.partner_cents := split.partner_cents;
  NEW.platform_cents := split.platform_cents;
  NEW.instructor_net_cents :=
    split.instructor_net_cents + COALESCE(NEW.transport_cents, 0);

  PERFORM public.write_audit(
    'booking.individual_commission_applied', 'booking', NEW.id::text,
    NULL,
    jsonb_build_object(
      'instructor_id', NEW.instructor_id,
      'platform_commission_bps', individual_bps,
      'partner_id', NEW.partner_id,
      'requested_partner_commission_bps', affiliate_bps,
      'partner_cents', NEW.partner_cents,
      'platform_cents', NEW.platform_cents,
      'instructor_net_cents', NEW.instructor_net_cents
    ),
    'Individual instructor commission at booking creation'
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_instructor_commission_override()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bookings_instructor_commission_override
  ON public.bookings;
CREATE TRIGGER bookings_instructor_commission_override
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_instructor_commission_override();

NOTIFY pgrst, 'reload schema';
COMMIT;
