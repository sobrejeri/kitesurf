-- #93 / VNT-1008: grant Admin SELECT while retaining the existing
-- meeting_skill_progress_participant_read policy for student/instructor.
-- No changes to writes, existing data, or Protege 3B.
CREATE POLICY meeting_skill_progress_admin_read
ON public.meeting_skill_progress
FOR SELECT TO authenticated
USING (public.is_admin());
