-- Run only on a disposable restored database after installing the proposal.
BEGIN;
CREATE TEMP TABLE request_guard_fixture (
  student_id uuid, level public.lesson_level, language text, meetings jsonb
);
CREATE TRIGGER fixture_guard BEFORE INSERT ON request_guard_fixture
FOR EACH ROW EXECUTE FUNCTION public.guard_request_input();
DO $$
DECLARE student uuid; lvl public.lesson_level; bad jsonb; rejected boolean;
BEGIN
  SELECT id, coalesce(assessed_kite_level,self_reported_kite_level)
  INTO student,lvl FROM public.profiles WHERE role='student'
  AND coalesce(assessed_kite_level,self_reported_kite_level) IS NOT NULL LIMIT 1;
  IF student IS NULL THEN RAISE EXCEPTION 'Fixture requires a synthetic student'; END IF;
  INSERT INTO request_guard_fixture VALUES(student,lvl,'Português','[{"starts_at":"2030-01-01T09:00:00-03:00","hours":2}]');
  FOR bad IN SELECT value FROM jsonb_array_elements('[{"hours":2},{"starts_at":"2030-01-01T09:00:00-03:00"},{"starts_at":null,"hours":2}]') LOOP
    rejected:=false;
    BEGIN
      INSERT INTO request_guard_fixture VALUES(student,lvl,'Português',jsonb_build_array(bad));
    EXCEPTION WHEN SQLSTATE '22023' THEN rejected:=true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'Missing field accepted'; END IF;
  END LOOP;
  rejected:=false;
  BEGIN
    INSERT INTO request_guard_fixture VALUES(student,lvl,'invalid-language','[{"starts_at":"2030-01-01T09:00:00-03:00","hours":2}]');
  EXCEPTION WHEN SQLSTATE '22023' THEN rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Invalid language accepted'; END IF;
END $$;
ROLLBACK;
