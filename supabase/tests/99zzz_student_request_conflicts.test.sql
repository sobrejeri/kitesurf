-- Regression: a student cannot search the queue twice for overlapping hours.
-- This fixture rolls back and never affects real data.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  student uuid := '00000000-0000-0000-0000-0000000000b1';
  beach uuid;
  pricing bigint;
  base_time timestamptz := now() + interval '260 days';
  slots jsonb;
  req uuid;
BEGIN
  SELECT id INTO beach FROM public.beaches WHERE slug='prea';
  SELECT id INTO pricing FROM public.price_versions ORDER BY id DESC LIMIT 1;
  slots := jsonb_build_array(jsonb_build_object('starts_at',base_time::text,'hours',2));
  INSERT INTO public.instructor_requests(
    student_id,beach_id,level,language,meetings,total_hours,price_version_id)
  VALUES(student,beach,'first_time','Português',slots,2,pricing)
  RETURNING id INTO req;

  BEGIN
    INSERT INTO public.instructor_requests(
      student_id,beach_id,level,language,meetings,total_hours,price_version_id)
    VALUES(student,beach,'first_time','Português',
      jsonb_build_array(jsonb_build_object(
        'starts_at',(base_time + interval '1 hour')::text,'hours',2)),2,pricing);
    RAISE EXCEPTION 'Overlapping student request was accepted';
  EXCEPTION WHEN unique_violation THEN
    ASSERT SQLERRM = 'Student already has a lesson at the selected time',
      'Expected student conflict, not a different unique violation';
  END;

  -- Back-to-back lessons touch at the boundary, but do not overlap.
  INSERT INTO public.instructor_requests(
    student_id,beach_id,level,language,meetings,total_hours,price_version_id)
  VALUES(student,beach,'first_time','Português',
    jsonb_build_array(jsonb_build_object(
      'starts_at',(base_time + interval '2 hours')::text,'hours',2)),2,pricing);
  ASSERT (SELECT count(*) FROM public.instructor_requests
    WHERE student_id=student AND id<>req AND expires_at>now()) >= 1,
    'Adjacent non-overlapping time must remain available';
END $$;
ROLLBACK;
