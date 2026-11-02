-- Vento | Migration 27 | Levels, self-declared medals and instructor assessment
-- Requires Migration 26 and public.lesson_level ('first_time','returning','improving').
-- No retrospective changes to booking financial snapshots or recorded skills.
BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS self_reported_kite_level public.lesson_level
    NOT NULL DEFAULT 'first_time',
  ADD COLUMN IF NOT EXISTS assessed_kite_level public.lesson_level,
  ADD COLUMN IF NOT EXISTS kite_assessed_by uuid REFERENCES public.instructors(id),
  ADD COLUMN IF NOT EXISTS kite_assessed_at timestamptz;

COMMENT ON COLUMN public.profiles.self_reported_kite_level IS
  'Self-reported proficiency; does not imply training, competence, or external certification.';
COMMENT ON COLUMN public.profiles.assessed_kite_level IS
  'Assessment by an assigned instructor after a completed lesson, not an IKO certification.';

-- Keep the existing registration trigger behaviour. The mandatory student
-- registration form sends kite_level as untrusted self-reported metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $new_user$
DECLARE
  requested text := new.raw_user_meta_data ->> 'role';
  chosen public.app_role := CASE
    WHEN requested IN ('instructor','partner') THEN requested::public.app_role
    ELSE 'student'::public.app_role
  END;
  declared text := new.raw_user_meta_data ->> 'kite_level';
BEGIN
  INSERT INTO public.profiles (id,role,full_name,self_reported_kite_level)
  VALUES (
    new.id,
    chosen,
    left(coalesce(new.raw_user_meta_data ->> 'full_name',''),120),
    CASE WHEN chosen='student'
      AND declared IN ('first_time','returning','improving')
      THEN declared::public.lesson_level
      ELSE 'first_time'::public.lesson_level
    END
  );
  IF chosen='instructor' THEN
    INSERT INTO public.instructors(id) VALUES(new.id);
  END IF;
  RETURN new;
END;
$new_user$;

-- Students can update only their OWN self-reported level. A prior instructor
-- assessment does not disappear or get replaced by self-report.
CREATE OR REPLACE FUNCTION public.set_my_kite_level(
  p_level public.lesson_level
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $own_level$
DECLARE
  uid uuid := public.require_role(ARRAY['student']::public.app_role[]);
BEGIN
  IF p_level IS NULL THEN
    RAISE EXCEPTION 'Select your kitesurf level' USING errcode='22023';
  END IF;
  UPDATE public.profiles SET self_reported_kite_level=p_level
  WHERE id=uid AND role='student';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student profile not found' USING errcode='P0002';
  END IF;
END;
$own_level$;
REVOKE ALL ON FUNCTION public.set_my_kite_level(public.lesson_level)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_my_kite_level(public.lesson_level)
  TO authenticated;

-- Assessment can only be issued by the instructor assigned to a COMPLETED
-- encounter. It may be updated after additional lessons by another assigned
-- instructor; this history is saved in the append-only audit log.
CREATE OR REPLACE FUNCTION public.assess_student_kite_level(
  p_meeting_id uuid,
  p_level public.lesson_level
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $assess$
DECLARE
  uid uuid := public.require_role(ARRAY['instructor']::public.app_role[]);
  student uuid;
  previous_level public.lesson_level;
BEGIN
  IF p_level IS NULL THEN
    RAISE EXCEPTION 'Select an assessed level' USING errcode='22023';
  END IF;
  SELECT b.student_id INTO student
  FROM public.booking_meetings m
  JOIN public.bookings b ON b.id=m.booking_id
  WHERE m.id=p_meeting_id
    AND m.status='done'
    AND b.instructor_id=uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the assigned instructor can assess a completed lesson'
      USING errcode='42501';
  END IF;
  SELECT p.assessed_kite_level INTO previous_level
  FROM public.profiles p WHERE p.id=student FOR UPDATE;
  UPDATE public.profiles SET
    assessed_kite_level=p_level,
    kite_assessed_by=uid,
    kite_assessed_at=now()
  WHERE id=student AND role='student';
  PERFORM public.write_audit(
    'student.kite_level_assessed','student',student::text,
    jsonb_build_object('level',previous_level),
    jsonb_build_object('level',p_level,'meeting_id',p_meeting_id),
    'Instructor assessed the student after a completed meeting'
  );
END;
$assess$;
REVOKE ALL ON FUNCTION public.assess_student_kite_level(uuid,public.lesson_level)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assess_student_kite_level(uuid,public.lesson_level)
  TO authenticated;

-- Server enforcement of the level-selection matrix for NEW reservations.
-- Existing reservations are never edited. Admin-only test creation and SQL
-- migrations are unaffected. All three choices remain visible to beginners;
-- intermediate students cannot book beginner lessons, and advanced students
-- can only book advanced lessons as requested by the product.
CREATE OR REPLACE FUNCTION public.enforce_student_lesson_level()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $eligibility$
DECLARE
  profile_level public.lesson_level;
BEGIN
  IF auth.uid() IS NULL
    OR public.current_app_role() <> 'student'::public.app_role
  THEN
    RETURN NEW;
  END IF;
  SELECT coalesce(p.assessed_kite_level,p.self_reported_kite_level)
    INTO profile_level
  FROM public.profiles p WHERE p.id=NEW.student_id AND p.role='student';
  IF profile_level IS NULL THEN
    RAISE EXCEPTION 'Select a level in your student profile'
      USING errcode='22023';
  END IF;
  IF (profile_level='returning' AND NEW.level='first_time')
     OR (profile_level='improving' AND NEW.level<>'improving') THEN
    RAISE EXCEPTION 'Lesson level is not eligible for this student'
      USING errcode='22023';
  END IF;
  RETURN NEW;
END;
$eligibility$;
REVOKE ALL ON FUNCTION public.enforce_student_lesson_level()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS bookings_student_level_guard ON public.bookings;
CREATE TRIGGER bookings_student_level_guard
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_student_lesson_level();

NOTIFY pgrst, 'reload schema';
COMMIT;
