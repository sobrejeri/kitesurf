-- Vento | Regression tests for kite development and private student photos.
-- Transaction rolls back test-only avatar and lesson updates.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users(id,email,raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-0000000000b4',
        'unrelated-skill-user@test.invalid',
        '{"full_name":"Sem vinculo"}'::jsonb);

DO $$
DECLARE
  lesson public.booking_meetings;
  reservation public.bookings;
  avatar_name text;
  other_instructor uuid;
BEGIN
  SELECT m.* INTO lesson
  FROM public.booking_meetings m
  JOIN public.bookings b ON b.id=m.booking_id
  WHERE b.instructor_id IS NOT NULL
    AND b.status IN ('confirmed','completed')
  ORDER BY m.starts_at DESC
  LIMIT 1;
  ASSERT lesson.id IS NOT NULL, 'A meeting fixture with an assigned instructor is required';
  SELECT * INTO reservation FROM public.bookings WHERE id=lesson.booking_id;

  avatar_name := reservation.student_id::text || '/avatar.jpg';
  INSERT INTO public.student_private_profiles(id,avatar_path)
  VALUES (reservation.student_id,avatar_name)
  ON CONFLICT(id) DO UPDATE SET avatar_path=excluded.avatar_path;

  -- Another instructor, without this student as a booking participant,
  -- must not gain access to that student's photo.
  SELECT i.id INTO other_instructor
  FROM public.instructors i
  WHERE i.id <> reservation.instructor_id
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b WHERE b.instructor_id=i.id
        AND b.student_id=reservation.student_id
        AND b.status IN ('confirmed','completed')
    ) LIMIT 1;

  IF other_instructor IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', other_instructor::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    ASSERT NOT public.instructor_can_read_student_avatar(avatar_name),
      'Unassigned instructor can read student photo';
    EXECUTE 'RESET ROLE';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', reservation.instructor_id::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ASSERT public.instructor_can_read_student_avatar(avatar_name),
    'Assigned instructor cannot see booked student photo';
  ASSERT EXISTS(SELECT 1 FROM public.get_my_instructor_student_avatar_paths()
    WHERE student_id=reservation.student_id AND avatar_path=avatar_name),
    'Photo path RPC omitted assigned student';
  ASSERT NOT public.instructor_can_read_student_avatar(
      reservation.student_id::text || '/other.jpg'),
    'Instructor can read unrelated student objects';

  -- A meeting has to be started before it can receive skill entries.
  -- We test with a fixture transitioned to in-progress inside this
  -- roll-back transaction rather than modifying live booking history.
  EXECUTE 'RESET ROLE';
  UPDATE public.booking_meetings SET status='in_progress'
  WHERE id=lesson.id;

  PERFORM set_config('request.jwt.claim.sub', reservation.instructor_id::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    PERFORM public.record_meeting_with_skills(
      lesson.id, 30, ARRAY[1], ARRAY[1]
    );
    RAISE EXCEPTION 'Duplicate skill result should be rejected';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  ASSERT NOT EXISTS(SELECT 1 FROM public.meeting_skill_progress
    WHERE meeting_id=lesson.id), 'Invalid skill submission wrote records';

  PERFORM public.record_meeting_with_skills(
    lesson.id, LEAST(60, lesson.minutes), ARRAY[1,2], ARRAY[3]
  );
  ASSERT (SELECT count(*) FROM public.meeting_skill_progress
    WHERE meeting_id=lesson.id) = 3, 'Not all skills were recorded';
  ASSERT (SELECT result FROM public.meeting_skill_progress
    WHERE meeting_id=lesson.id AND step_number=3) = 'mastered',
    'Concluded skill not saved';
  ASSERT (SELECT status FROM public.booking_meetings WHERE id=lesson.id)='done',
    'Meeting minutes were not finalized';

  BEGIN
    PERFORM public.record_meeting_with_skills(
      lesson.id, LEAST(60, lesson.minutes), ARRAY[1], ARRAY[]::integer[]
    );
    RAISE EXCEPTION 'A finished encounter was recorded twice';
  EXCEPTION WHEN sqlstate '55000' THEN NULL;
  END;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', reservation.student_id::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ASSERT (SELECT count(*) FROM public.meeting_skill_progress
    WHERE meeting_id=lesson.id) = 3, 'Student cannot view own lesson skills';
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-0000000000b4', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ASSERT (SELECT count(*) FROM public.meeting_skill_progress
    WHERE meeting_id=lesson.id) = 0, 'Unrelated student can read class progress';
  ASSERT NOT public.instructor_can_read_student_avatar(avatar_name),
    'Unrelated account can sign student avatar';
  BEGIN
    PERFORM public.record_meeting_with_skills(
      lesson.id, 60, ARRAY[1], ARRAY[]::integer[]
    );
    RAISE EXCEPTION 'Student was able to submit instructor skill progress';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';

  ASSERT NOT has_function_privilege('anon',
    'public.get_my_instructor_student_avatar_paths()','EXECUTE'),
    'Anonymous user can query student avatar paths';
  ASSERT NOT has_function_privilege('anon',
    'public.record_meeting_with_skills(uuid,integer,integer[],integer[])',
    'EXECUTE'), 'Anonymous user can write kite milestones';
  ASSERT EXISTS (SELECT 1 FROM storage.buckets
    WHERE id='vento-student-avatars' AND public=false),
    'Student bucket must be private';
END $$;

ROLLBACK;
