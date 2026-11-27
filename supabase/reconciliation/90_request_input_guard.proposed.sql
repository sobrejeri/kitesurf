-- Proposed reconciliation #90. Validate on isolated restore before applying remotely.
CREATE OR REPLACE FUNCTION public.guard_request_input()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE slot jsonb; profile_level public.lesson_level;
BEGIN
  IF NEW.language IS NULL OR NEW.language NOT IN ('Português','Inglês','Espanhol','Francês','Alemão','Italiano') THEN
    RAISE EXCEPTION 'Invalid language' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(p.assessed_kite_level,p.self_reported_kite_level) INTO profile_level
    FROM public.profiles p WHERE p.id=NEW.student_id AND p.role='student';
  IF profile_level IS NULL OR NEW.level IS NULL
    OR (profile_level='returning' AND NEW.level='first_time')
    OR (profile_level='improving' AND NEW.level<>'improving') THEN
    RAISE EXCEPTION 'Lesson level is not eligible for this student' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(NEW.meetings) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid meetings' USING ERRCODE='22023';
  END IF;
  FOR slot IN SELECT value FROM pg_catalog.jsonb_array_elements(NEW.meetings) LOOP
    IF jsonb_typeof(slot) IS DISTINCT FROM 'object' OR nullif(btrim(slot->>'starts_at'),'') IS NULL
      OR nullif(btrim(slot->>'hours'),'') IS NULL THEN
      RAISE EXCEPTION 'Meeting date and hours are required' USING ERRCODE='22023';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_request_input() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER request_00_input_guard BEFORE INSERT ON public.instructor_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_request_input();
