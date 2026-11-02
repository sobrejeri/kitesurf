-- Vento: students see only the instructor avatar attached to their own booking.
-- Uses business-rule fixture data and rolls back all test changes.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id,email,raw_user_meta_data)
VALUES (
  '00000000-0000-0000-0000-0000000000b3',
  'no-booking-avatar-test@example.invalid',
  '{"full_name":"Sem reserva"}'::jsonb
);

INSERT INTO public.instructor_private_profiles(id, avatar_path)
VALUES (
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000a1/avatar.jpg'
)
ON CONFLICT (id) DO UPDATE SET avatar_path = EXCLUDED.avatar_path;

DO $$
DECLARE
  own_booking uuid;
  avatar text := '00000000-0000-0000-0000-0000000000a1/avatar.jpg';
BEGIN
  SELECT b.id INTO own_booking FROM public.bookings b
  WHERE b.student_id = '00000000-0000-0000-0000-0000000000b1'
    AND b.instructor_id = '00000000-0000-0000-0000-0000000000a1'
    AND b.status = 'confirmed'
  LIMIT 1;
  ASSERT own_booking IS NOT NULL, 'Fixture must contain confirmed student booking';

  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-0000000000b1', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ASSERT public.get_my_booking_instructor_avatar(own_booking) = avatar,
    'Student with booking cannot see assigned instructor avatar';
  ASSERT public.student_can_read_instructor_avatar(avatar),
    'Student with booking cannot sign avatar object';
  ASSERT NOT public.student_can_read_instructor_avatar(
    '00000000-0000-0000-0000-0000000000a1/unrelated.jpg'),
    'Student can read an unrelated private object';

  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-0000000000b3', true);
  ASSERT public.get_my_booking_instructor_avatar(own_booking) IS NULL,
    'Unrelated student can look up someone else booking avatar';
  ASSERT NOT public.student_can_read_instructor_avatar(avatar),
    'Student without a booking can sign instructor photo';

  EXECUTE 'RESET ROLE';
  ASSERT NOT has_function_privilege(
    'anon',
    'public.get_my_booking_instructor_avatar(uuid)',
    'EXECUTE'
  ), 'Anonymous role can query a private instructor avatar';
  ASSERT EXISTS(
    SELECT 1 FROM storage.buckets
    WHERE id = 'vento-instructor-avatars' AND public = false
  ), 'Instructor avatar bucket must remain private';
  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'vento_instructor_avatar_booked_student_select'
      AND cmd = 'SELECT'
  ), 'Student avatar SELECT policy missing';
END $$;

ROLLBACK;
