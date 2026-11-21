-- #93 / VNT-1008: meeting skill progress is RLS-enabled but has no
-- SELECT policies in the Kitesurf test database. Preserve student and
-- assigned-instructor access and grant authenticated Admin read access.
-- No write privileges or existing records are modified.
CREATE POLICY meeting_skill_progress_booking_read
ON public.meeting_skill_progress
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.booking_meetings AS m
    JOIN public.bookings AS b ON b.id = m.booking_id
    WHERE m.id = meeting_skill_progress.meeting_id
      AND (b.student_id = auth.uid() OR b.instructor_id = auth.uid() OR public.is_admin())
  )
);
