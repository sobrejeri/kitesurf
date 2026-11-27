-- Run only on a disposable restored database after installing the proposal.
BEGIN;
CREATE TEMP TABLE request_guard_fixture (
  student_id uuid, level public.lesson_level, language text, meetings jsonb
);
CREATE TRIGGER fixture_guard BEFORE INSERT ON request_guard_fixture
FOR EACH ROW EXECUTE FUNCTION public.guard_request_input();
DO $$
DECLARE student uuid; lvl public.lesson_level; bad jsonb; rejected boolean; candidate public.lesson_level; expected boolean;
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
  -- Exhaustively check the policy for each profile level present in the restore.
  FOR student,lvl IN SELECT DISTINCT ON (coalesce(assessed_kite_level,self_reported_kite_level))
    id,coalesce(assessed_kite_level,self_reported_kite_level)
    FROM public.profiles WHERE role='student'
    AND coalesce(assessed_kite_level,self_reported_kite_level) IS NOT NULL
  LOOP
    FOREACH candidate IN ARRAY enum_range(NULL::public.lesson_level) LOOP
      expected := (lvl='returning' AND candidate='first_time')
        OR (lvl='improving' AND candidate<>'improving');
      rejected:=false;
      BEGIN
        INSERT INTO request_guard_fixture VALUES(student,candidate,'Português','[{"starts_at":"2030-01-01T09:00:00-03:00","hours":2}]');
      EXCEPTION WHEN SQLSTATE '22023' THEN rejected:=true;
      END;
      IF rejected IS DISTINCT FROM expected THEN
        RAISE EXCEPTION 'Level policy mismatch: % -> %',lvl,candidate;
      END IF;
    END LOOP;
  END LOOP;
END $$;
ROLLBACK;
