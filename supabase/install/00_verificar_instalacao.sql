-- Vento | Verificacao de migrations (nao altera dados)
-- Execute este SELECT no Supabase SQL Editor ANTES e DEPOIS de aplicar as migrations.
-- "Detectado" e uma verificacao de referencia, nao uma auditoria de todas as policies.
WITH checks(ordem, arquivo, detectado) AS (
 VALUES
 (4,  '20261031000004_support_vehicle.sql',
   to_regprocedure('public.create_booking(uuid,public.lesson_level,text,jsonb,text,boolean)') IS NOT NULL
   AND EXISTS(SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='instructors'
              AND column_name='has_support_vehicle')),
 (5,  '20261101000005_instructor_profile.sql',
   to_regclass('public.instructor_private_profiles') IS NOT NULL
   AND to_regclass('public.instructor_payout_details') IS NOT NULL),
 (6,  '20261101000006_student_avatar.sql',
   to_regclass('public.student_private_profiles') IS NOT NULL
   AND EXISTS(SELECT 1 FROM storage.buckets WHERE id='vento-student-avatars')),
 (7,  '20261101000007_instructor_schedules.sql',
   to_regclass('public.instructor_schedule_settings') IS NOT NULL
   AND to_regclass('public.instructor_time_off') IS NOT NULL),
 (8,  '20261101000008_booking_messages.sql',
   to_regclass('public.booking_messages') IS NOT NULL),
 (9,  '20261101000009_test_checkout.sql',
   to_regclass('public.test_payment_attempts') IS NOT NULL),
 (10, '20261101000010_first_paid_referral.sql',
   coalesce(position('First paid booking already exists' IN
      pg_get_functiondef(to_regprocedure('public.confirm_test_payment(uuid)'))) > 0, false)),
 (11, '20261101000011_instructor_offers.sql',
   to_regclass('public.instructor_requests') IS NOT NULL
   AND to_regclass('public.instructor_offers') IS NOT NULL),
 (12, '20261101000012_instructor_ratings.sql',
   to_regclass('public.instructor_ratings') IS NOT NULL),
 (13, '20261101000013_preferred_instructor.sql',
   EXISTS(SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='instructor_requests'
          AND column_name='preferred_instructor_id')),
 (14, '20261101000014_date_suggestions.sql',
   EXISTS(SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='instructor_offers'
          AND column_name='suggested_meetings')),
 (15, '20261101000015_lesson_incidents.sql',
   to_regclass('public.booking_incidents') IS NOT NULL),
 (16, '20261101000016_in_app_notifications.sql',
   to_regclass('public.app_notifications') IS NOT NULL),
 (17, '20261101000017_instructor_documents.sql',
   to_regclass('public.instructor_documents') IS NOT NULL
   AND EXISTS(SELECT 1 FROM storage.buckets WHERE id='vento-instructor-documents')),
 (18, '20261101000018_approval_document_gate.sql',
   coalesce(position('Instructor documents must be approved before activation' IN
      pg_get_functiondef(to_regprocedure('public.set_instructor_status(uuid,public.instructor_status,text)'))) > 0, false)),
 (19, '20261101000019_meeting_points.sql',
   to_regclass('public.meeting_points') IS NOT NULL
   AND EXISTS(SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='bookings'
          AND column_name='meeting_point_id'))
)
SELECT lpad(ordem::text,2,'0') AS numero, arquivo,
       CASE WHEN detectado THEN 'DETECTADO - conferir historico antes de repetir'
            ELSE 'NAO DETECTADO - verificar se precisa aplicar' END AS situacao
FROM checks ORDER BY ordem;
