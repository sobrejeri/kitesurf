-- Isolated PostgreSQL only. The production table must remain unchanged.
\set ON_ERROR_STOP on
BEGIN;

WITH seed AS (
 SELECT to_jsonb(b) AS data FROM public.bookings b
 WHERE b.status='confirmed' AND b.instructor_id IS NOT NULL LIMIT 1
)
INSERT INTO public.bookings
SELECT copied.* FROM seed,
 LATERAL jsonb_populate_record(NULL::public.bookings,
   seed.data || jsonb_build_object(
     'id','00000000-0000-0000-0000-000000009041',
     'code','VNT-PROTEGE-RLS-40',
     'created_at',now(),'confirmed_at',now(),'status','confirmed'
   )) copied;
INSERT INTO public.booking_meetings
 (id,booking_id,position,starts_at,minutes,status)
VALUES ('00000000-0000-0000-0000-000000009042',
        '00000000-0000-0000-0000-000000009041',
        1,now()-interval '8 days',60,'scheduled');

SELECT student_id, instructor_id FROM public.bookings
 WHERE id='00000000-0000-0000-0000-000000009041' \gset
SELECT CASE WHEN :'instructor_id'::uuid='00000000-0000-0000-0000-0000000000a1'::uuid
 THEN '00000000-0000-0000-0000-0000000000a2'::uuid
 ELSE '00000000-0000-0000-0000-0000000000a1'::uuid
 END AS new_instructor_id \gset
SELECT set_config('test.instructor_original',:'instructor_id',false);
SELECT set_config('test.instructor_new',:'new_instructor_id',false);
SELECT set_config('test.student',:'student_id',false);

DO $$ BEGIN
 ASSERT (SELECT relrowsecurity FROM pg_class
  WHERE oid='public.booking_incidents'::regclass),
  'Incident RLS must be enabled';
 ASSERT NOT has_table_privilege('authenticated','public.booking_incidents','INSERT'),
  'Clients may not insert protected incidents directly';
 ASSERT NOT has_function_privilege('authenticated',
  'public.capture_protection_incident_participant()','EXECUTE'),
  'Snapshot trigger must not expose an authenticated RPC';
END $$;

SELECT set_config('request.jwt.claim.sub',:'student_id',false);
SET ROLE authenticated;
SELECT public.report_lesson_incident(
 '00000000-0000-0000-0000-000000009041',
 '00000000-0000-0000-0000-000000009042',
 'weather',0,'O encontro foi cancelado pelo vento e quero registrar o ocorrido.'
) AS student_incident_id \gset
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',:'instructor_id',false);
SET ROLE authenticated;
SELECT public.report_lesson_incident(
 '00000000-0000-0000-0000-000000009041',
 '00000000-0000-0000-0000-000000009042',
 'safety',0,'O encontro teve condições de risco e precisei informar ao aluno.'
) AS old_instructor_incident_id \gset
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.booking_incidents
   WHERE booking_id='00000000-0000-0000-0000-000000009041')=2,
 'Original instructor reads their own and the student report';
END $$;
RESET ROLE;

SELECT set_config('test.old_incident',:'old_instructor_incident_id',false);
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.booking_incidents
  WHERE booking_id='00000000-0000-0000-0000-000000009041'
    AND instructor_at_report_id=current_setting('test.instructor_original')::uuid)=2,
  'Both reports must capture the original instructor';
END $$;

UPDATE public.bookings SET instructor_id=:'new_instructor_id'::uuid
 WHERE id='00000000-0000-0000-0000-000000009041';

SELECT set_config('request.jwt.claim.sub',:'new_instructor_id',false);
SET ROLE authenticated;
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.booking_incidents
   WHERE booking_id='00000000-0000-0000-0000-000000009041')=0,
   'Replacement instructor must not inherit prior incidents';
END $$;
SELECT public.report_lesson_incident(
 '00000000-0000-0000-0000-000000009041',
 '00000000-0000-0000-0000-000000009042',
 'equipment',0,'Após assumir esta reserva, registrei um novo problema de equipamento.'
);
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.booking_incidents
   WHERE booking_id='00000000-0000-0000-0000-000000009041')=1,
   'Replacement sees only their own assignment incident';
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',:'instructor_id',false);
SET ROLE authenticated;
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.booking_incidents
   WHERE booking_id='00000000-0000-0000-0000-000000009041')=2,
   'Former instructor retains their own assignment history';
 BEGIN
  PERFORM public.report_lesson_incident(
   '00000000-0000-0000-0000-000000009041',
   '00000000-0000-0000-0000-000000009042',
   'safety',0,'Este profissional foi substituído e não deve criar um novo relato.'
  );
  RAISE EXCEPTION 'Former instructor bypassed report owner check';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',:'student_id',false);
SET ROLE authenticated;
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.booking_incidents
   WHERE booking_id='00000000-0000-0000-0000-000000009041')=3,
 'Student must see reports from both assignments';
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',false);
SET ROLE authenticated;
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.booking_incidents
   WHERE booking_id='00000000-0000-0000-0000-000000009041')=0,
 'Affiliate must see no incidents';
END $$;
RESET ROLE;

-- Simulate a true pre-upgrade row with unknown historical instructor:
-- NULL is safer than backfilling from the present assignment.
ALTER TABLE public.booking_incidents DISABLE TRIGGER capture_protection_incident_participant;
INSERT INTO public.booking_incidents
 (id,booking_id,meeting_id,reported_by,incident_type,minutes_done,description)
VALUES (
 '00000000-0000-0000-0000-000000009043',
 '00000000-0000-0000-0000-000000009041',
 '00000000-0000-0000-0000-000000009042',
 :'student_id'::uuid,'other',0,
 'Relato antigo sem registro verificável do instrutor atribuído no momento.'
);
ALTER TABLE public.booking_incidents ENABLE TRIGGER capture_protection_incident_participant;
DO $$ BEGIN
 ASSERT (SELECT instructor_at_report_id IS NULL FROM public.booking_incidents
 WHERE id='00000000-0000-0000-0000-000000009043'),
 'Legacy unknown assignment stays NULL';
END $$;

SELECT set_config('request.jwt.claim.sub',:'new_instructor_id',false);
SET ROLE authenticated;
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.booking_incidents
  WHERE id='00000000-0000-0000-0000-000000009043')=0,
  'Replacement must not see unsnapshotted historical report';
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
SET ROLE authenticated;
SELECT public.review_lesson_incident(
  :'old_instructor_incident_id'::uuid,'reviewing',
  'Solicitamos mais esclarecimentos antes de concluir este relato.'
);
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.booking_incidents
   WHERE booking_id='00000000-0000-0000-0000-000000009041')=4,
 'Admin retains read permission for all cases';
 ASSERT (SELECT instructor_at_report_id=current_setting('test.instructor_original')::uuid
   FROM public.booking_incidents WHERE id=current_setting('test.old_incident')::uuid),
   'Admin review preserves old instructor snapshot';
END $$;
RESET ROLE;

DO $$ BEGIN
 BEGIN
  UPDATE public.booking_incidents
   SET instructor_at_report_id=current_setting('test.instructor_new')::uuid
   WHERE id=current_setting('test.old_incident')::uuid;
  RAISE EXCEPTION 'Admin-level update changed historical participant';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
