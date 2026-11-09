-- VentoKite Protege: future privacy hardening for existing incident history.
-- PREPARED ONLY: the production migration ledger is absent; do NOT run on the
-- connected Supabase until schema baseline, recovery plan and approval.
-- This SQL is validated solely in the CI throwaway PostgreSQL.
BEGIN;

-- Legacy incident rows have no trustworthy historical assignment snapshot.
-- Leave them NULL and fail closed: do not falsely backfill from current booking.
ALTER TABLE public.booking_incidents
  ADD COLUMN instructor_at_report_id uuid REFERENCES public.profiles(id);
COMMENT ON COLUMN public.booking_incidents.instructor_at_report_id IS
 'Instructor assigned when this incident was originally filed; NULL for legacy rows whose historical assignment cannot be proved.';
CREATE INDEX booking_incidents_instructor_at_report_idx
  ON public.booking_incidents(instructor_at_report_id)
  WHERE instructor_at_report_id IS NOT NULL;

-- Internal trigger always captures the live assignment, ignoring client input.
-- FOR SHARE serializes reassignment with snapshot creation.
CREATE FUNCTION public.capture_protection_incident_participant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT b.instructor_id INTO NEW.instructor_at_report_id
      FROM public.bookings b WHERE b.id=NEW.booking_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Booking unavailable' USING errcode='42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.booking_id IS DISTINCT FROM OLD.booking_id
    OR NEW.meeting_id IS DISTINCT FROM OLD.meeting_id
    OR NEW.reported_by IS DISTINCT FROM OLD.reported_by
    OR NEW.instructor_at_report_id IS DISTINCT FROM OLD.instructor_at_report_id THEN
    RAISE EXCEPTION 'Incident participant snapshot is immutable'
      USING errcode='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_protection_incident_participant()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER capture_protection_incident_participant
 BEFORE INSERT OR UPDATE ON public.booking_incidents
 FOR EACH ROW EXECUTE FUNCTION public.capture_protection_incident_participant();

-- New/reassigned instructor cannot read incidents filed before assignment.
-- Original instructor keeps access to cases from their own assignment,
-- including student-filed cases; the student/admin keep their case history.
DROP POLICY incident_participants_read ON public.booking_incidents;
CREATE POLICY incident_participants_read ON public.booking_incidents
 FOR SELECT TO authenticated USING (
  public.is_admin()
  OR reported_by=auth.uid()
  OR instructor_at_report_id=auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id=booking_id AND b.student_id=auth.uid()
  )
);

-- No new INSERT, UPDATE or DELETE rights and no payment/presence changes.
COMMIT;
