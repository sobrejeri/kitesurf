-- Vento: declared vs assessed kite levels, badges and restrictions.
-- Run only in isolated CI PostgreSQL; all fixture changes are rolled back.
\set ON_ERROR_STOP on
BEGIN;

-- Student self-assessment from signup metadata, never a verified certificate.
INSERT INTO auth.users (id,email,raw_user_meta_data)
VALUES (
  '00000000-0000-0000-0000-0000000000b5',
  'kite-level-self-report-test@example.invalid',
  '{"role":"student","full_name":"Aluno Prata","kite_level":"returning"}'::jsonb
);

DO $$
DECLARE
  fixture_id uuid := '00000000-0000-0000-0000-0000000000b5';
  instructor_id uuid;
  lesson_id uuid;
  student_id uuid;
  found_assessed public.lesson_level;
BEGIN
  ASSERT (SELECT p.self_reported_kite_level FROM public.profiles p
    WHERE p.id=fixture_id) = 'returning'::public.lesson_level,
    'Signup level not stored';
  ASSERT (SELECT p.assessed_kite_level FROM public.profiles p
    WHERE p.id=fixture_id) IS NULL,
    'Student declared level must not become instructor assessment';

  PERFORM set_config('request.jwt.claim.sub',fixture_id::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.set_my_kite_level('improving');
  EXECUTE 'RESET ROLE';
  ASSERT (SELECT p.self_reported_kite_level FROM public.profiles p
    WHERE p.id=fixture_id)='improving'::public.lesson_level,
    'Student cannot change own declaration';
  ASSERT (SELECT p.assessed_kite_level FROM public.profiles p
    WHERE p.id=fixture_id) IS NULL,
    'Student changed assessed level';
  
  SELECT m.id,b.instructor_id,b.student_id
    INTO lesson_id,instructor_id,student_id
  FROM public.booking_meetings m
  JOIN public.bookings b ON b.id=m.booking_id
  WHERE b.instructor_id IS NOT NULL
  ORDER BY m.starts_at DESC
  LIMIT 1;
  ASSERT lesson_id IS NOT NULL, 'Requires a booked lesson fixture';

  PERFORM set_config('request.jwt.claim.sub',fixture_id::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.assess_student_kite_level(lesson_id,'improving');
    RAISE EXCEPTION 'Student changed instructor-verified level';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';

  UPDATE public.booking_meetings
  SET status='done'
  WHERE id=lesson_id;

  PERFORM set_config('request.jwt.claim.sub',instructor_id::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.assess_student_kite_level(lesson_id,'returning');
  EXECUTE 'RESET ROLE';

  SELECT p.assessed_kite_level INTO found_assessed
  FROM public.profiles p WHERE p.id=student_id;
  ASSERT found_assessed='returning'::public.lesson_level,
    'Assigned instructor did not persist evaluated level';
  ASSERT EXISTS(SELECT 1 FROM public.audit_logs
    WHERE action='student.kite_level_assessed' AND entity_id=student_id::text),
    'Instructor assessments must be audited';

  -- Direct writes cannot promote the verified field, even if the client
  -- forges a POST rather than using the RPC.
  PERFORM set_config('request.jwt.claim.sub',student_id::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.profiles SET assessed_kite_level='improving'
    WHERE id=student_id;
    RAISE EXCEPTION 'Student updated instructor assessment directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';

  ASSERT NOT has_function_privilege(
    'anon','public.assess_student_kite_level(uuid,public.lesson_level)','EXECUTE'
  ), 'Anonymous role can assess a student';
END $$;

ROLLBACK;
