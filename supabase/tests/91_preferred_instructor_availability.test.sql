-- Regression for #91/#92: every candidate, including preferred, must pass instructor_can_attend.
DO $$
DECLARE body text;
BEGIN
  SELECT pg_get_functiondef('public.advance_instructor_offer(uuid)'::regprocedure) INTO body;
  IF body IS NULL THEN
    RAISE EXCEPTION 'advance_instructor_offer missing';
  END IF;
  IF position('if not public.instructor_can_attend(i.id,r.meetings)' in lower(body)) = 0 THEN
    RAISE EXCEPTION 'availability guard missing for queue candidates';
  END IF;
  IF position('i.id is distinct from r.preferred_instructor_id' in lower(body)) > 0 THEN
    RAISE EXCEPTION 'preferred instructor bypass still present';
  END IF;
END $$;
