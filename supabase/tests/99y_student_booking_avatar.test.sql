-- Vento: students see only avatars from their own bookings.
-- Transactional fixtures: creates a no-booking user and temporarily sets a
-- real booked instructor's avatar. Nothing is persisted after this test.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id,email,raw_user_meta_data)
VALUES (
  '00000000-0000-0000-0000-0000000000b3',
  'no-booking-avatar-test@example.invalid',
  '{"full_name":"Sem reserva"}'::jsonb
);

DO $$
DECLARE
  own_booking uuid;
  booked_student uuid;
  booked_instructor uuid;
  avatar text;
BEGIN
  -- Do not rely on booking statuses from other independent SQL test files.
  -- Any active/completed booking with an assigned instructor is sufficient.
  SELECT b.id, b.student_id, b.instructor_id
    INTO own_booking, booked_student, booked_instructor
  FROM public.bookings b
  WHERE b.instructor_id IS NOT NULL
    AND b.status IN ('awaiting_payment','confirmed','completed')
  ORDER BY b.created_at DESC
  LIMIT 1;
  ASSERT own_booking IS NOT NULL, 'Fixture must contain an active or completed booking';

  avatar := booked_instructor::text || '/avatar.jpg';
  INSERT INTO public.instructor_private_profiles(id, avatar_path)
  VALUES (booked_instructor, avatar)
  ON CONFLICT (id) DO UPDATE SET avatar_path = EXCLUDED.avatar_path;

  PERFORM set_config('request.jwt.claim.sub', booked_student::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  ASSERT public.get_my_booking_instructor_avatar(own_booking) = avatar,
    'Booked student cannot see assigned instructor avatar';
  ASSERT public.student_can_read_instructor_avatar(avatar),
    'Booked student cannot sign assigned instructor avatar';
  ASSERT NOT public.student_can_read_instructor_avatar(
    booked_instructor::text || '/other.jpg'),
    'Booked student can access an unrelated private object';

  -- A logged-in student with no reservations must not be authorized.
  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-0000000000b3', true);
  ASSERT public.get_my_booking_instructor_avatar(own_booking) IS NULL,
    'Student could see another student booking avatar';
  ASSERT NOT public.student_can_read_instructor_avatar(avatar),
    'Student without booking can sign a private instructor avatar';

  EXECUTE 'RESET ROLE';
  ASSERT NOT has_function_privilege(
    'anon', 'public.get_my_booking_instructor_avatar(uuid)', 'EXECUTE'
  ), 'Anonymous role can query a private instructor avatar';
  ASSERT EXISTS(
    SELECT 1 FROM storage.buckets
    WHERE id = 'vento-instructor-avatars' AND public = false
  ), 'Instructor avatar bucket must remain private';
  ASSERT EXISTS(
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'vento_instructor_avatar_booked_student_select'
      AND cmd = 'SELECT'
  ), 'Student avatar SELECT policy missing';
END $$;

ROLLBACK;
