-- Level prices are part of the immutable price version, never the student profile.
BEGIN;

-- NULL on historical versions means the original common hourly rate.
-- No existing price row or booking snapshot is updated by this migration.
ALTER TABLE public.price_versions
  ADD COLUMN intermediate_hourly_cents integer
    CHECK (intermediate_hourly_cents BETWEEN 1000 AND 1000000),
  ADD COLUMN advanced_hourly_cents integer
    CHECK (advanced_hourly_cents BETWEEN 1000 AND 1000000);

CREATE FUNCTION public.publish_level_price_version(
  p_beginner_cents integer, p_intermediate_cents integer, p_advanced_cents integer,
  p_commission_bps integer, p_transport_hourly_cents integer,
  p_reason text, p_expected_version_id bigint
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  uid uuid:=public.require_role(ARRAY['admin']::public.app_role[]);
  previous public.price_versions;
  new_id bigint;
BEGIN
  IF p_beginner_cents IS NULL OR p_beginner_cents NOT BETWEEN 1000 AND 1000000
    OR p_intermediate_cents IS NULL OR p_intermediate_cents NOT BETWEEN 1000 AND 1000000
    OR p_advanced_cents IS NULL OR p_advanced_cents NOT BETWEEN 1000 AND 1000000
    OR p_commission_bps IS NULL OR p_commission_bps NOT BETWEEN 0 AND 10000
    OR p_transport_hourly_cents IS NULL OR p_transport_hourly_cents NOT BETWEEN 0 AND 1000000
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Invalid level prices or audit reason' USING errcode='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(36004);
  previous:=public.current_price_version();
  IF p_expected_version_id IS DISTINCT FROM previous.id THEN
    RAISE EXCEPTION 'Prices changed. Reload before publishing'
      USING errcode='55000',HINT='PRICE_VERSION_STALE';
  END IF;
  INSERT INTO public.price_versions(
    hourly_rate_cents,intermediate_hourly_cents,advanced_hourly_cents,
    platform_commission_bps,transport_hourly_cents,created_by,reason
  ) VALUES(p_beginner_cents,p_intermediate_cents,p_advanced_cents,
    p_commission_bps,p_transport_hourly_cents,uid,btrim(p_reason))
  RETURNING id INTO new_id;
  PERFORM public.write_audit('price.levels_published','price_version',new_id::text,
    to_jsonb(previous),jsonb_build_object('beginner_cents',p_beginner_cents,
      'intermediate_cents',p_intermediate_cents,'advanced_cents',p_advanced_cents,
      'platform_commission_bps',p_commission_bps,
      'transport_hourly_cents',p_transport_hourly_cents),btrim(p_reason));
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.publish_level_price_version(integer,integer,integer,integer,integer,text,bigint)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_level_price_version(integer,integer,integer,integer,integer,text,bigint)
  TO authenticated;

CREATE FUNCTION public.quote_table_by_level()
RETURNS TABLE(level public.lesson_level,hours integer,hourly_rate_cents integer,
  total_cents integer,transport_hourly_cents integer,transport_cents integer,
  total_with_transport_cents integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.price_versions:=public.current_price_version();
BEGIN
  IF v.id IS NULL THEN RAISE EXCEPTION 'No price published' USING errcode='P0002'; END IF;
  RETURN QUERY
  SELECT rates.lesson_level,h,rates.rate,h*rates.rate,
    v.transport_hourly_cents,h*v.transport_hourly_cents,
    h*rates.rate+h*v.transport_hourly_cents
  FROM (VALUES
    ('first_time'::public.lesson_level,v.hourly_rate_cents),
    ('returning'::public.lesson_level,coalesce(v.intermediate_hourly_cents,v.hourly_rate_cents)),
    ('improving'::public.lesson_level,coalesce(v.advanced_hourly_cents,v.hourly_rate_cents))
  ) rates(lesson_level,rate)
  CROSS JOIN pg_catalog.generate_series(1,8) h;
END $$;
REVOKE ALL ON FUNCTION public.quote_table_by_level() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.quote_table_by_level() TO anon,authenticated;

-- All booking paths (queue, preferred instructor, direct and admin test)
-- derive the rate from the pinned version before its snapshot is inserted.
CREATE FUNCTION public.apply_booking_level_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.price_versions; rate integer; affiliate_bps integer:=0; split record;
BEGIN
  SELECT * INTO v FROM public.price_versions WHERE id=NEW.price_version_id;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Price version unavailable' USING errcode='P0002'; END IF;
  rate:=CASE NEW.level
    WHEN 'first_time' THEN v.hourly_rate_cents
    WHEN 'returning' THEN coalesce(v.intermediate_hourly_cents,v.hourly_rate_cents)
    WHEN 'improving' THEN coalesce(v.advanced_hourly_cents,v.hourly_rate_cents)
  END;
  IF rate IS NULL THEN RAISE EXCEPTION 'Invalid lesson level' USING errcode='22023'; END IF;
  IF NEW.partner_id IS NOT NULL THEN
    SELECT p.commission_bps INTO affiliate_bps FROM public.partners p WHERE p.id=NEW.partner_id;
  END IF;
  NEW.hourly_rate_cents:=rate;
  NEW.transport_hourly_cents:=CASE WHEN NEW.with_transport THEN v.transport_hourly_cents ELSE 0 END;
  NEW.transport_cents:=NEW.total_hours*NEW.transport_hourly_cents;
  NEW.total_cents:=NEW.total_hours*rate+NEW.transport_cents;
  SELECT * INTO split FROM public.split_total(NEW.total_hours*rate,v.platform_commission_bps,affiliate_bps);
  NEW.partner_cents:=split.partner_cents;
  NEW.platform_cents:=split.platform_cents;
  NEW.instructor_net_cents:=split.instructor_net_cents+NEW.transport_cents;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.apply_booking_level_price() FROM PUBLIC,anon,authenticated;
-- PostgreSQL runs BEFORE triggers alphabetically: level pricing comes before
-- bookings_instructor_commission_override, which retains negotiated fees.
CREATE TRIGGER bookings_00_level_price BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.apply_booking_level_price();

-- A searching request keeps its own version, even after another publication.
CREATE FUNCTION public.my_instructor_request_quote(p_request_id uuid)
RETURNS TABLE(hourly_rate_cents integer,total_cents integer,transport_cents integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=public.require_role(ARRAY['student']::public.app_role[]);
  r public.instructor_requests; v public.price_versions; rate integer; transport integer;
BEGIN
  SELECT * INTO r FROM public.instructor_requests WHERE id=p_request_id AND student_id=uid;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found' USING errcode='P0002'; END IF;
  SELECT * INTO v FROM public.price_versions WHERE id=r.price_version_id;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Price version unavailable' USING errcode='P0002'; END IF;
  rate:=CASE r.level WHEN 'first_time' THEN v.hourly_rate_cents
    WHEN 'returning' THEN coalesce(v.intermediate_hourly_cents,v.hourly_rate_cents)
    WHEN 'improving' THEN coalesce(v.advanced_hourly_cents,v.hourly_rate_cents) END;
  transport:=CASE WHEN r.with_transport THEN r.total_hours*v.transport_hourly_cents ELSE 0 END;
  RETURN QUERY SELECT rate,r.total_hours*rate+transport,transport;
END $$;
REVOKE ALL ON FUNCTION public.my_instructor_request_quote(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.my_instructor_request_quote(uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
