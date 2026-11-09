-- Stage 3B assertions. Runs ONLY in the throwaway PostgreSQL CI database.
\set ON_ERROR_STOP on
BEGIN;

-- A cloned confirmed booking avoids touching the production-like lesson flows.
-- This migration is not installed on the real Supabase by this test.
WITH seed AS (
 SELECT to_jsonb(b) AS data FROM public.bookings b
 WHERE b.status='confirmed' AND b.instructor_id IS NOT NULL LIMIT 1
)
INSERT INTO public.bookings
SELECT copied.* FROM seed,
 LATERAL jsonb_populate_record(
   NULL::public.bookings,
   seed.data || jsonb_build_object(
     'id','00000000-0000-0000-0000-000000009039',
     'code','VNT-PROTEGE-CI', 'created_at',now(),
     'confirmed_at',now(), 'status','confirmed'
   )
 ) copied;

INSERT INTO public.booking_meetings
 (id,booking_id,position,starts_at,minutes,status)
VALUES (
 '00000000-0000-0000-0000-000000009040',
 '00000000-0000-0000-0000-000000009039',
 1,now()-interval '7 days',60,'scheduled'
);

DO $$ BEGIN
 ASSERT (SELECT relrowsecurity FROM pg_class
   WHERE oid='public.lesson_protection_statements'::regclass),
   'RLS needed on protection statements';
 ASSERT (SELECT relrowsecurity FROM pg_class
   WHERE oid='public.lesson_protection_reviews'::regclass),
   'RLS needed on reviews';
 ASSERT (SELECT relrowsecurity FROM pg_class
   WHERE oid='public.lesson_protection_evidence'::regclass),
   'RLS needed on private evidence';
 ASSERT (SELECT NOT has_table_privilege('authenticated',
   'public.lesson_protection_statements','INSERT')),
   'Participants must not insert evidence or statements directly';
 ASSERT (SELECT NOT public.protection_evidence_storage_access('fake/file.pdf',true)),
   'Arbitrary Storage paths must be rejected';
 ASSERT (SELECT NOT public.protection_evidence_storage_access('fake/file.pdf',false)),
   'Arbitrary Storage paths must not be visible';
END $$;

-- Pick the actual student and instructor on the cloned fixture.
SELECT student_id AS student_id, instructor_id AS instructor_id
FROM public.bookings WHERE code='VNT-PROTEGE-CI' \gset

SELECT set_config('request.jwt.claim.sub',:'student_id',false);
SET ROLE authenticated;
SELECT public.submit_lesson_protection_statement(
 '00000000-0000-0000-0000-000000009040','not_delivered',0,
 'A aula não aconteceu e não houve registro de presença nesse dia.'
) AS first_statement \gset
SELECT public.submit_lesson_protection_statement(
 '00000000-0000-0000-0000-000000009040','weather_or_safety',0,
 'O vento apresentou risco e por isso o encontro ficou sem realização.'
) AS revised_statement \gset
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.lesson_protection_statements
 WHERE meeting_id='00000000-0000-0000-0000-000000009040')=2,
 'Two append-only student versions must exist';
 ASSERT (SELECT max(version) FROM public.lesson_protection_statements
 WHERE meeting_id='00000000-0000-0000-0000-000000009040')=2,
 'Student revision must be version two';
 BEGIN
  UPDATE public.lesson_protection_statements SET narrative='mutated';
  RAISE EXCEPTION 'Client edited past testimony';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.submit_lesson_protection_statement(
   '00000000-0000-0000-0000-000000009040','delivered',0,
   'Invalid minutes should fail.');
  RAISE EXCEPTION 'Accepted contradictory minutes';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',:'instructor_id',false);
SET ROLE authenticated;
SELECT public.submit_lesson_protection_statement(
 '00000000-0000-0000-0000-000000009040','delivered',60,
 'Eu compareci ao local e entendo que a aula foi prestada integralmente.'
);
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.lesson_protection_statements
  WHERE meeting_id='00000000-0000-0000-0000-000000009040')=3,
 'Assigned instructor can create a separate declaration';
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',false);
SET ROLE authenticated;
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.lesson_protection_statements
 WHERE meeting_id='00000000-0000-0000-0000-000000009040')=0,
 'Affiliate cannot read protected declarations';
 BEGIN
  PERFORM public.submit_lesson_protection_statement(
   '00000000-0000-0000-0000-000000009040','delivered',60,
   'Uma pousada nunca pode se fazer passar por instrutor ou aluno.');
  RAISE EXCEPTION 'Partner submitted a statement';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',false);
SET ROLE authenticated;
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.lesson_protection_statements
 WHERE meeting_id='00000000-0000-0000-0000-000000009040')=0,
 'Unrelated student must not see declarations';
 BEGIN
  PERFORM public.submit_lesson_protection_statement(
   '00000000-0000-0000-0000-000000009040','not_delivered',0,
   'Sou uma terceira pessoa sem qualquer relação com esta aula.');
  RAISE EXCEPTION 'Unrelated student submitted a statement';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
SET ROLE authenticated;
SELECT public.review_lesson_protection_case(
 '00000000-0000-0000-0000-000000009040','disputed',
 'As versões das duas partes são divergentes e exigem comprovação adicional.'
);
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.lesson_protection_reviews
 WHERE meeting_id='00000000-0000-0000-0000-000000009040')=1,
 'Admin can document a non-financial assessment';
 ASSERT (SELECT count(*) FROM public.lesson_protection_statements
 WHERE meeting_id='00000000-0000-0000-0000-000000009040')=3,
 'Admin review does not alter statements';
 ASSERT (SELECT status FROM public.booking_meetings
 WHERE id='00000000-0000-0000-0000-000000009040')='scheduled',
 'Statements never mark lesson done';
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',:'student_id',false);
SET ROLE authenticated;
SELECT upload_id,object_path FROM public.prepare_lesson_protection_evidence(
 :'first_statement'::uuid,'foto.jpg','image/jpeg',900
) \gset
SELECT set_config('test.protection_path',:'object_path',false);
SELECT set_config('test.protection_upload_id',:'upload_id',false);
DO $ BEGIN
 ASSERT (SELECT count(*) FROM public.lesson_protection_evidence
  WHERE uploader_id=auth.uid() AND NOT confirmed)=1,
  'Evidence must start pending and private';
 ASSERT public.protection_evidence_storage_access(current_setting('test.protection_path'),true),
  'Only prepared owner path may be used for upload';
END $$;
RESET ROLE;

-- Simulate successful private object upload as database admin in isolated test.
INSERT INTO storage.objects(bucket_id,name)
VALUES ('vento-protection-evidence',:'object_path');
SET ROLE authenticated;
SELECT public.confirm_lesson_protection_evidence(:'upload_id'::uuid);
DO $$ BEGIN
 ASSERT (SELECT confirmed FROM public.lesson_protection_evidence
   WHERE id=current_setting('test.protection_upload_id')::uuid), 'Upload must be confirmed';
 ASSERT NOT public.protection_evidence_storage_access(current_setting('test.protection_path'),true),
   'Confirmed objects may not be overwritten';
END $$;
RESET ROLE;

ROLLBACK;
