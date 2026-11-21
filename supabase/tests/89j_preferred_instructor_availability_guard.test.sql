-- P0 #92: preferred instructor must not bypass availability checks.
-- Runs after migrations in disposable PostgreSQL via scripts/test-db.sh.
BEGIN;
DO $$
DECLARE definition text;
BEGIN
  SELECT lower(pg_get_functiondef('public.advance_instructor_offer(uuid)'::regprocedure))
    INTO definition;
  IF definition NOT LIKE '%order by case when ins.id=r.preferred_instructor_id then 0 else 1 end%' THEN
    RAISE EXCEPTION 'Preferred instructor priority unexpectedly removed';
  END IF;
  IF definition !~ 'if[[:space:]]+not[[:space:]]+public[.]instructor_can_attend[(]i[.]id,[[:space:]]*r[.]meetings[)]' THEN
    RAISE EXCEPTION 'P0: instructor availability is not enforced for every candidate';
  END IF;
  IF definition ~ 'i[.]id[[:space:]]+is[[:space:]]+distinct[[:space:]]+from[[:space:]]+r[.]preferred_instructor_id[[:space:]]+and[[:space:]]+not[[:space:]]+public[.]instructor_can_attend' THEN
    RAISE EXCEPTION 'P0: preferred instructor bypasses availability';
  END IF;
END $$;
ROLLBACK;
