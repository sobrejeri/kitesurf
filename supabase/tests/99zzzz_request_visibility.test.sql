-- RLS regression: a visible offer must include its own request, without
-- granting access to other requests or to other students' records.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.act_as(uid text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub',uid,false);
  EXECUTE 'SET ROLE authenticated';
END $$;
CREATE FUNCTION pg_temp.reset() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub','',false);
END $$;
DO $$
DECLARE
  req uuid;
  offer uuid;
  teacher uuid;
  beach uuid;
  pricing bigint;
BEGIN
  SELECT id INTO beach FROM public.beaches WHERE slug='prea';
  SELECT id INTO pricing FROM public.price_versions ORDER BY id DESC LIMIT 1;
  SELECT id INTO teacher FROM public.instructors ORDER BY id LIMIT 1;
  INSERT INTO public.instructor_requests (
    student_id,beach_id,level,language,meetings,total_hours,price_version_id
  ) VALUES (
    '00000000-0000-0000-0000-0000000000b1',beach,'first_time','Português',
    jsonb_build_array(jsonb_build_object('starts_at',now()+interval '300 days','hours',1)),1,pricing
  ) RETURNING id INTO req;
  INSERT INTO public.instructor_offers(request_id,instructor_id,expires_at)
  VALUES(req,teacher,now()+interval '2 minutes') RETURNING id INTO offer;

  PERFORM pg_temp.act_as(teacher::text);
  ASSERT EXISTS(SELECT 1 FROM public.instructor_requests r WHERE r.id=req),
    'The offered instructor must be able to read the request details';
  ASSERT EXISTS(
    SELECT 1 FROM public.instructor_offers o
    JOIN public.instructor_requests r ON r.id=o.request_id
    WHERE o.id=offer AND r.id=req
  ), 'The offer and its request must survive the same RLS-filtered join';
  PERFORM pg_temp.reset();

  PERFORM pg_temp.act_as((SELECT i.id::text FROM public.instructors i WHERE i.id<>teacher LIMIT 1));
  ASSERT NOT EXISTS(SELECT 1 FROM public.instructor_requests r WHERE r.id=req),
    'An instructor without this offer must not read the request';
  PERFORM pg_temp.reset();

  PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
  ASSERT EXISTS(SELECT 1 FROM public.instructor_requests r WHERE r.id=req),
    'The owning student must retain access';
  PERFORM pg_temp.reset();

  PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
  ASSERT NOT EXISTS(SELECT 1 FROM public.instructor_requests r WHERE r.id=req),
    'An unrelated student must not read the request';
  PERFORM pg_temp.reset();
END $$;
ROLLBACK;
