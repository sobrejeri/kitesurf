-- Migration 42: close the read-only booking minutes balance IDOR.
-- The production database has an untracked historical migration 38;
-- CREATE OR REPLACE preserves the existing formula/signature and alters
-- only authorization. Does NOT modify bookings, lessons or money.
BEGIN;

CREATE OR REPLACE FUNCTION public.booking_balance_minutes(p_booking_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT GREATEST(0,
    b.total_hours * 60
    - COALESCE((SELECT sum(m.done_minutes)::integer
                FROM public.booking_meetings m
                WHERE m.booking_id=b.id AND m.status='done'),0)
    - COALESCE((SELECT sum(m.minutes)::integer
                FROM public.booking_meetings m
                WHERE m.booking_id=b.id
                  AND m.status IN ('scheduled','in_progress')),0)
  )
  FROM public.bookings b
  WHERE b.id=p_booking_id
    AND (
      b.student_id=auth.uid()
      OR b.instructor_id=auth.uid()
      OR public.is_admin()
    );
$function$;

COMMENT ON FUNCTION public.booking_balance_minutes(uuid) IS
  'Read-only remaining booking minutes. Available only to the student, currently assigned instructor, or Admin. Unknown/unauthorized booking returns NULL.';
REVOKE ALL ON FUNCTION public.booking_balance_minutes(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.booking_balance_minutes(uuid)
  TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
