-- Proposed additive #90 patch, NOT a migration. Validate in disposable PG only.
-- Promote to a CLI-generated migration after schema reconciliation.
BEGIN;
CREATE FUNCTION public.guard_request_distinct_civil_days()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.meetings IS NOT DISTINCT FROM OLD.meetings THEN RETURN NEW; END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(NEW.meetings) AS slot(m)
    GROUP BY ((slot.m->>'starts_at')::timestamptz AT TIME ZONE 'America/Fortaleza')::date
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Only one meeting per local calendar day is allowed' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_request_distinct_civil_days() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER request_00_distinct_civil_days
BEFORE INSERT OR UPDATE OF meetings ON public.instructor_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_request_distinct_civil_days();
COMMIT;
