-- Vento | Migration 26: student photos + per-meeting kite progress
-- Requires migrations 06 (student avatars) and core meeting functions.
-- No payment, commission, scheduling or historical booking amounts change.
BEGIN;

-- Each finished encounter can record which skills were practised or mastered.
-- An encounter's records are immutable to students and instructors afterward.
CREATE TABLE IF NOT EXISTS public.meeting_skill_progress (
  meeting_id uuid NOT NULL
    REFERENCES public.booking_meetings(id) ON DELETE CASCADE,
  step_number smallint NOT NULL CHECK (step_number BETWEEN 1 AND 6),
  result text NOT NULL CHECK (result IN ('practiced', 'mastered')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meeting_id, step_number)
);
CREATE INDEX IF NOT EXISTS meeting_skill_progress_step_idx
  ON public.meeting_skill_progress (step_number, result);
ALTER TABLE public.meeting_skill_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meeting_skill_progress FROM anon, authenticated;
GRANT SELECT ON public.meeting_skill_progress TO authenticated;

DROP POLICY IF EXISTS meeting_skill_progress_participant_read
  ON public.meeting_skill_progress;
CREATE POLICY meeting_skill_progress_participant_read
ON public.meeting_skill_progress FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.booking_meetings m
    JOIN public.bookings b ON b.id = m.booking_id
    WHERE m.id = meeting_id
      AND (b.student_id = (SELECT auth.uid())
        OR b.instructor_id = (SELECT auth.uid()))
  )
);

-- The instructor saves lesson minutes + the selected steps atomically.
-- Only for a meeting already started using the student's presence code.
CREATE OR REPLACE FUNCTION public.record_meeting_with_skills(
  p_meeting_id uuid,
  p_done_minutes integer,
  p_practiced_steps integer[],
  p_mastered_steps integer[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_instructor uuid := public.require_role(ARRAY['instructor']::public.app_role[]);
  v_meeting public.booking_meetings;
  v_booking public.bookings;
  v_steps integer[];
BEGIN
  SELECT * INTO v_meeting FROM public.booking_meetings
    WHERE id = p_meeting_id FOR UPDATE;
  SELECT * INTO v_booking FROM public.bookings
    WHERE id = v_meeting.booking_id;
  IF v_meeting.id IS NULL OR v_booking.instructor_id IS DISTINCT FROM v_instructor THEN
    RAISE EXCEPTION 'Meeting not found' USING errcode='P0002';
  END IF;
  IF v_meeting.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Start the meeting with the presence code first'
      USING errcode='55000';
  END IF;
  IF p_done_minutes IS NULL OR p_done_minutes < 0
    OR p_done_minutes > v_meeting.minutes THEN
    RAISE EXCEPTION 'Invalid minutes' USING errcode='22023';
  END IF;
  IF p_practiced_steps IS NULL OR p_mastered_steps IS NULL THEN
    RAISE EXCEPTION 'Skill lists are required' USING errcode='22023';
  END IF;

  v_steps := p_practiced_steps || p_mastered_steps;
  IF EXISTS (SELECT 1 FROM unnest(v_steps) AS x
             WHERE x IS NULL OR x NOT BETWEEN 1 AND 6)
     OR cardinality(v_steps) <> (
        SELECT count(DISTINCT x) FROM unnest(v_steps) AS x
      )
     OR (p_done_minutes = 0 AND cardinality(v_steps) > 0)
     OR (p_done_minutes > 0 AND cardinality(v_steps) = 0)
  THEN
    RAISE EXCEPTION 'Select valid kite skills for the minutes taught'
      USING errcode='22023';
  END IF;

  -- Existing function enforces instructor ownership, minutes, state transitions
  -- and updates the booking's completed status. Any later failure rolls back
  -- that change too, so no half-recorded lesson is possible.
  PERFORM public.record_meeting(p_meeting_id, p_done_minutes, '');
  INSERT INTO public.meeting_skill_progress(meeting_id,step_number,result)
    SELECT p_meeting_id, x::smallint, 'practiced'
    FROM unnest(p_practiced_steps) AS x
    UNION ALL
    SELECT p_meeting_id, x::smallint, 'mastered'
    FROM unnest(p_mastered_steps) AS x;

  PERFORM public.write_audit(
    'meeting.skills_recorded', 'booking_meeting', p_meeting_id::text,
    NULL, jsonb_build_object('practiced',p_practiced_steps,
                            'mastered',p_mastered_steps,
                            'done_minutes',p_done_minutes),
    'Instructor marked kite development at encounter completion'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.record_meeting_with_skills(uuid,integer,integer[],integer[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_meeting_with_skills(uuid,integer,integer[],integer[])
  TO authenticated;

-- Instructor receives only the student avatar path, not private data.
CREATE OR REPLACE FUNCTION public.get_my_instructor_student_avatar_paths()
RETURNS TABLE(student_id uuid, avatar_path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT DISTINCT b.student_id, sp.avatar_path
  FROM public.bookings b
  JOIN public.student_private_profiles sp ON sp.id = b.student_id
  WHERE b.instructor_id = auth.uid()
    AND public.current_app_role() = 'instructor'::public.app_role
    AND b.status IN ('confirmed','completed')
    AND sp.avatar_path IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.get_my_instructor_student_avatar_paths()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_instructor_student_avatar_paths()
  TO authenticated;

-- The Storage policy grants SELECT for exactly the profile photo belonging
-- to a student with an active or completed booking for the instructor.
CREATE OR REPLACE FUNCTION public.instructor_can_read_student_avatar(
  p_object_name text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.current_app_role() = 'instructor'::public.app_role
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.student_private_profiles sp
        ON sp.id = b.student_id
      WHERE b.instructor_id = auth.uid()
        AND b.status IN ('confirmed','completed')
        AND sp.avatar_path = p_object_name
    );
$$;
REVOKE ALL ON FUNCTION public.instructor_can_read_student_avatar(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instructor_can_read_student_avatar(text)
  TO authenticated;

DROP POLICY IF EXISTS vento_student_avatar_booked_instructor_select
  ON storage.objects;
CREATE POLICY vento_student_avatar_booked_instructor_select
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'vento-student-avatars'
    AND public.instructor_can_read_student_avatar(name)
  );


-- New entry point for day-by-day lessons. The existing start_meeting keeps
-- validating the student's presence code and instructor authorization.
-- The new endpoint additionally requires the scheduled Ceará date to have
-- arrived and every earlier encounter of this booking to be completed.
CREATE OR REPLACE FUNCTION public.start_ordered_meeting(
  p_meeting_id uuid, p_presence_code text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $ordered$
DECLARE
  v_instructor uuid := public.require_role(ARRAY['instructor']::public.app_role[]);
  v_meeting public.booking_meetings;
  v_booking public.bookings;
BEGIN
  SELECT * INTO v_meeting
    FROM public.booking_meetings WHERE id=p_meeting_id FOR UPDATE;
  SELECT * INTO v_booking
    FROM public.bookings WHERE id=v_meeting.booking_id FOR UPDATE;
  IF v_meeting.id IS NULL OR v_booking.instructor_id IS DISTINCT FROM v_instructor THEN
    RAISE EXCEPTION 'Meeting not found' USING errcode='P0002';
  END IF;
  IF v_meeting.status <> 'scheduled' OR v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Meeting cannot be started' USING errcode='55000';
  END IF;
  IF (v_meeting.starts_at AT TIME ZONE 'America/Fortaleza')::date
      > (now() AT TIME ZONE 'America/Fortaleza')::date THEN
    RAISE EXCEPTION 'Meeting day has not arrived'
      USING errcode='55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.booking_meetings previous
    WHERE previous.booking_id=v_meeting.booking_id
      AND previous.position<v_meeting.position
      AND previous.status <> 'done'
  ) THEN
    RAISE EXCEPTION 'Finish the previous meeting first'
      USING errcode='55000';
  END IF;
  PERFORM public.start_meeting(p_meeting_id,p_presence_code);
END;
$ordered$;
REVOKE ALL ON FUNCTION public.start_ordered_meeting(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_ordered_meeting(uuid,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
