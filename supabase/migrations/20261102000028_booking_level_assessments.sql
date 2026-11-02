-- VENTO | Migration 28
-- One instructor assessment per completed booking (separate from each meeting).
-- Keep the historic progress of every reservation; prevent duplicate pending
-- assessment forms from remaining after a booking's evaluation.
BEGIN;

CREATE TABLE IF NOT EXISTS public.booking_level_assessments (
  booking_id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL REFERENCES public.booking_meetings(id),
  instructor_id uuid NOT NULL REFERENCES public.instructors(id),
  student_id uuid NOT NULL REFERENCES public.profiles(id),
  assessed_level public.lesson_level NOT NULL,
  assessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_level_assessments_student_idx
  ON public.booking_level_assessments(student_id, assessed_at DESC);

ALTER TABLE public.booking_level_assessments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_level_assessments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.booking_level_assessments TO authenticated;

DROP POLICY IF EXISTS booking_level_assessments_participants
  ON public.booking_level_assessments;
CREATE POLICY booking_level_assessments_participants
ON public.booking_level_assessments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id=booking_id
      AND (
        b.student_id=(SELECT auth.uid())
        OR b.instructor_id=(SELECT auth.uid())
        OR (SELECT public.is_admin())
      )
  )
);

-- Recover previously submitted instructor assessments from the append-only
-- audit trail. Include only those whose booking has no remaining active
-- sessions, as legacy evaluations could have been made after day 1 of 4.
INSERT INTO public.booking_level_assessments (
  booking_id, meeting_id, instructor_id, student_id, assessed_level, assessed_at
)
SELECT DISTINCT ON (m.booking_id)
  m.booking_id, m.id, b.instructor_id, b.student_id,
  (a.new_state ->> 'level')::public.lesson_level,
  a.created_at
FROM public.audit_logs a
JOIN public.booking_meetings m
  ON m.id::text=a.new_state ->> 'meeting_id'
JOIN public.bookings b ON b.id=m.booking_id
WHERE a.action='student.kite_level_assessed'
  AND a.new_state ->> 'level' IN ('first_time','returning','improving')
  AND b.instructor_id IS NOT NULL
  AND m.status='done'
  AND NOT EXISTS (
    SELECT 1 FROM public.booking_meetings unclosed
    WHERE unclosed.booking_id=b.id
      AND unclosed.status IN ('scheduled','in_progress')
  )
ORDER BY m.booking_id,a.created_at DESC
ON CONFLICT (booking_id) DO NOTHING;

-- Existing RPC signature stays unchanged, so deployed clients remain
-- compatible. A booking is eligible only once all planned lessons are over.
CREATE OR REPLACE FUNCTION public.assess_student_kite_level(
  p_meeting_id uuid, p_level public.lesson_level
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $assess_booking$
DECLARE
  v_instructor uuid := public.require_role(ARRAY['instructor']::public.app_role[]);
  v_booking public.bookings;
  v_student uuid;
  v_previous_level public.lesson_level;
BEGIN
  IF p_level IS NULL THEN
    RAISE EXCEPTION 'Select an assessed level' USING errcode='22023';
  END IF;

  SELECT b.* INTO v_booking FROM public.booking_meetings m
  JOIN public.bookings b ON b.id=m.booking_id
  WHERE m.id=p_meeting_id AND m.status='done'
    AND b.instructor_id=v_instructor
  FOR UPDATE OF b;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Only the assigned instructor can assess a completed lesson'
      USING errcode='42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.booking_meetings m
    WHERE m.booking_id=v_booking.id
      AND m.status IN ('scheduled','in_progress')
  ) THEN
    RAISE EXCEPTION 'Complete all planned meetings before evaluating'
      USING errcode='55000';
  END IF;

  v_student := v_booking.student_id;
  SELECT assessed_kite_level INTO v_previous_level
  FROM public.profiles WHERE id=v_student FOR UPDATE;

  INSERT INTO public.booking_level_assessments(
    booking_id,meeting_id,instructor_id,student_id,assessed_level
  )
  VALUES(v_booking.id,p_meeting_id,v_instructor,v_student,p_level)
  ON CONFLICT (booking_id) DO UPDATE
    SET meeting_id=EXCLUDED.meeting_id,
        assessed_level=EXCLUDED.assessed_level,
        assessed_at=now();

  UPDATE public.profiles
    SET assessed_kite_level=p_level,
        kite_assessed_by=v_instructor,
        kite_assessed_at=now()
  WHERE id=v_student AND role='student';

  PERFORM public.write_audit(
    'student.kite_level_assessed','student',v_student::text,
    jsonb_build_object('level',v_previous_level),
    jsonb_build_object('level',p_level,'meeting_id',p_meeting_id,'booking_id',v_booking.id),
    'Instructor assessed level after all booking meetings were closed'
  );
END;
$assess_booking$;

REVOKE ALL ON FUNCTION public.assess_student_kite_level(uuid,public.lesson_level)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assess_student_kite_level(uuid,public.lesson_level)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;