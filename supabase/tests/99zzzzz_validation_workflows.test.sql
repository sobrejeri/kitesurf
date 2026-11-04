-- Validation confirmation must be owned, idempotent and excluded from commissions.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.act_as(uid text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claim.sub',uid,false); EXECUTE 'SET ROLE authenticated'; END $$;
CREATE FUNCTION pg_temp.reset() RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claim.sub','',false); END $$;
DO $$
DECLARE bid uuid; pricing bigint; beach uuid; partner uuid; counts record; expected_count integer;
BEGIN
 SELECT id INTO pricing FROM public.price_versions ORDER BY id DESC LIMIT 1;
 SELECT id INTO beach FROM public.beaches WHERE slug='prea';
 SELECT id INTO partner FROM public.partners WHERE owner_id='00000000-0000-0000-0000-0000000000c1';
 INSERT INTO public.bookings(code,student_id,instructor_id,partner_id,price_version_id,
   beach_id,level,language,total_hours,hourly_rate_cents,total_cents,partner_cents,
   platform_cents,instructor_net_cents,presence_code)
 VALUES('VNT-VALIDATION-TEST','00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000000a1',partner,pricing,beach,
   'first_time','Português',1,30000,30000,1000,3500,25500,'1234') RETURNING id INTO bid;

 PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
 BEGIN
   PERFORM public.confirm_validation_lesson(bid);
   RAISE EXCEPTION 'Another student confirmed the validation booking';
 EXCEPTION WHEN no_data_found THEN NULL; END;
 PERFORM pg_temp.reset();

 PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
 PERFORM public.confirm_validation_lesson(bid);
 PERFORM public.confirm_validation_lesson(bid);
 PERFORM pg_temp.reset();
 ASSERT EXISTS(SELECT 1 FROM public.bookings WHERE id=bid AND status='confirmed' AND is_test),
   'A confirmed validation booking must be explicitly marked as a test';
 ASSERT (SELECT total_cents FROM public.bookings WHERE id=bid)=30000,
   'The immutable price snapshot stays intact';
 ASSERT (SELECT count(*) FROM public.audit_logs WHERE action='booking.validation_confirmed' AND entity_id=bid::text)=1,
   'A retry cannot duplicate confirmation or rotate the instructor twice';
 ASSERT NOT EXISTS(SELECT 1 FROM public.test_payment_attempts WHERE booking_id=bid),
   'Validation does not generate a payment attempt';

 SELECT count(*) INTO expected_count FROM public.bookings b WHERE b.partner_id=partner AND NOT b.is_test AND b.status<>'cancelled';
 PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
 SELECT * INTO counts FROM public.partner_summary();
 ASSERT counts.bookings=expected_count,
   'Partner totals must ignore validation bookings';
 PERFORM pg_temp.reset();

 PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
 BEGIN
   PERFORM public.save_commercial_policy_draft(72,'Teste','Teste','Teste');
   RAISE EXCEPTION 'Student changed commercial drafts';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 ASSERT NOT EXISTS(SELECT 1 FROM public.commercial_policy_drafts),'Drafts must be private';
 PERFORM pg_temp.reset();
 PERFORM pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
 PERFORM public.save_commercial_policy_draft(72,'Cancelamento','Ausência','Vento');
 ASSERT EXISTS(SELECT 1 FROM public.commercial_policy_drafts WHERE cancellation_hours=72 AND weather='Vento'),
   'Admin draft must persist';
 PERFORM pg_temp.reset();
END $$;
ROLLBACK;
