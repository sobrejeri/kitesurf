-- Migration 34 | Confirm validation lessons without a checkout, and persist admin drafts.
-- Keeps financial snapshots frozen; validation lessons never count toward payouts.
BEGIN;

CREATE FUNCTION public.confirm_validation_lesson(p_booking_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=public.require_role(ARRAY['student']::public.app_role[]);
  b public.bookings;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id=p_booking_id FOR UPDATE;
  IF b.id IS NULL OR b.student_id<>uid THEN
    RAISE EXCEPTION 'Booking not found' USING errcode='P0002';
  END IF;
  IF b.status='confirmed' AND b.is_test THEN RETURN; END IF;
  IF b.status<>'awaiting_payment' OR b.instructor_id IS NULL
    OR b.created_at<now()-interval '10 minutes' THEN
    RAISE EXCEPTION 'Validation confirmation unavailable or expired' USING errcode='55000';
  END IF;
  UPDATE public.bookings SET is_test=true,status='confirmed',confirmed_at=now() WHERE id=b.id;
  UPDATE public.instructors SET queue_position=nextval('public.instructor_queue_seq') WHERE id=b.instructor_id;
  PERFORM public.write_audit('booking.validation_confirmed','booking',b.id::text,
    jsonb_build_object('status',b.status,'is_test',b.is_test),
    jsonb_build_object('status','confirmed','is_test',true),
    'Validation without checkout, charge, commission or payout');
END $$;
REVOKE ALL ON FUNCTION public.confirm_validation_lesson(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_validation_lesson(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.partner_summary()
RETURNS TABLE(bookings integer,pending_cents bigint,released_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=public.require_role(ARRAY['partner']::public.app_role[]);
BEGIN
  RETURN QUERY SELECT count(*)::integer,
    coalesce(sum(b.partner_cents) FILTER(WHERE b.status IN ('awaiting_payment','confirmed')),0),
    coalesce(sum(b.partner_cents) FILTER(WHERE b.status='completed'),0)
  FROM public.bookings b JOIN public.partners p ON p.id=b.partner_id
  WHERE p.owner_id=uid AND NOT b.is_test AND b.status<>'cancelled';
END $$;

CREATE OR REPLACE FUNCTION public.notify_confirmed_booking() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.status='confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
    IF NEW.instructor_id IS NOT NULL THEN
      INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
      VALUES(NEW.instructor_id,'booking','Aula confirmada',
        CASE WHEN NEW.is_test THEN 'Aula de validação sem cobrança. Confira sua agenda.'
          ELSE 'A reserva foi confirmada. Confira sua agenda.' END,'/instrutor/agenda');
    END IF;
    INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
    VALUES(NEW.student_id,'booking','Aula confirmada',
      CASE WHEN NEW.is_test THEN 'Validação confirmada sem cobrança. Confira sua reserva.'
        ELSE 'Confira sua reserva e as próximas instruções.' END,
      '/aluno/reserva/'||NEW.id::text);
  END IF;
  RETURN NEW;
END $$;

CREATE TABLE public.commercial_policy_drafts (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  cancellation_hours integer NOT NULL CHECK(cancellation_hours BETWEEN 0 AND 720),
  late_cancellation text NOT NULL DEFAULT '' CHECK(length(late_cancellation)<=5000),
  absence text NOT NULL DEFAULT '' CHECK(length(absence)<=5000),
  weather text NOT NULL DEFAULT '' CHECK(length(weather)<=5000),
  updated_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.commercial_policy_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_policy_drafts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.commercial_policy_drafts TO authenticated;
CREATE POLICY commercial_drafts_admin_read ON public.commercial_policy_drafts
  FOR SELECT TO authenticated USING(public.is_admin());

CREATE FUNCTION public.save_commercial_policy_draft(
  p_cancellation_hours integer,p_late_cancellation text,p_absence text,p_weather text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=public.require_role(ARRAY['admin']::public.app_role[]);
BEGIN
  IF p_cancellation_hours IS NULL OR p_cancellation_hours NOT BETWEEN 0 AND 720
    OR p_late_cancellation IS NULL OR length(p_late_cancellation)>5000
    OR p_absence IS NULL OR length(p_absence)>5000
    OR p_weather IS NULL OR length(p_weather)>5000 THEN
    RAISE EXCEPTION 'Invalid commercial policy draft' USING errcode='22023';
  END IF;
  INSERT INTO public.commercial_policy_drafts(singleton,cancellation_hours,late_cancellation,absence,weather,updated_by)
  VALUES(true,p_cancellation_hours,trim(p_late_cancellation),trim(p_absence),trim(p_weather),uid)
  ON CONFLICT(singleton) DO UPDATE SET cancellation_hours=excluded.cancellation_hours,
    late_cancellation=excluded.late_cancellation,absence=excluded.absence,
    weather=excluded.weather,updated_by=uid,updated_at=now();
  PERFORM public.write_audit('policy.draft_saved','commercial_policy','current',null,
    jsonb_build_object('cancellation_hours',p_cancellation_hours),
    'Saved draft only; no change to live cancellation rules or fees');
END $$;
REVOKE ALL ON FUNCTION public.save_commercial_policy_draft(integer,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_commercial_policy_draft(integer,text,text,text) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
