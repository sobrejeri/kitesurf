-- #93 / VNT-1008: allow authenticated administrators to read recorded
-- meeting skills, matching the existing booking_meetings SELECT authorization.
-- No write privileges are added; student/instructor policy remains unchanged.
CREATE POLICY meeting_skill_progress_admin_read
ON public.meeting_skill_progress
FOR SELECT TO authenticated
USING (public.is_admin());
