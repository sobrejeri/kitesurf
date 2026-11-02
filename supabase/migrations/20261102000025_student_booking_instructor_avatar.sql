-- VENTO | Migration 25 | Student booking instructor avatar
-- Grants only booked students the ability to sign the instructor's
-- actual avatar object. Does NOT expose phone, bank details or documents.
-- Run after migrations 05, 23 and 24. Does not modify booking data.
BEGIN;

-- Return only the avatar path of the instructor assigned to this student's
-- own booking. No private profile columns are returned to the caller.
CREATE OR REPLACE FUNCTION public.get_my_booking_instructor_avatar(
  p_booking_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ip.avatar_path
  FROM public.bookings b
  JOIN public.instructor_private_profiles ip
    ON ip.id = b.instructor_id
  WHERE b.id = p_booking_id
    AND b.student_id = auth.uid()
    AND public.current_app_role() = 'student'::public.app_role
    AND b.status IN ('awaiting_payment', 'confirmed', 'completed')
  LIMIT 1;
$$;

-- Called by the Storage SELECT policy. Checks the authenticated student's
-- own booking and the ONE avatar path recorded in the instructor's profile.
-- Cannot authorize reading documents or unrelated images.
CREATE OR REPLACE FUNCTION public.student_can_read_instructor_avatar(
  p_object_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND public.current_app_role() = 'student'::public.app_role
    AND EXISTS (
      SELECT 1
      FROM public.instructor_private_profiles ip
      JOIN public.bookings b ON b.instructor_id = ip.id
      WHERE ip.avatar_path = p_object_name
        AND b.student_id = auth.uid()
        AND b.status IN ('awaiting_payment', 'confirmed', 'completed')
    );
$$;

REVOKE ALL ON FUNCTION public.get_my_booking_instructor_avatar(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.student_can_read_instructor_avatar(text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_booking_instructor_avatar(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_can_read_instructor_avatar(text)
  TO authenticated;

DROP POLICY IF EXISTS vento_instructor_avatar_booked_student_select
  ON storage.objects;

CREATE POLICY vento_instructor_avatar_booked_student_select
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'vento-instructor-avatars'
  AND public.student_can_read_instructor_avatar(name)
);

NOTIFY pgrst, 'reload schema';
COMMIT;
