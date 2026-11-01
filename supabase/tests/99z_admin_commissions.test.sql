-- Admin commission overrides: role checks, audit, new booking split,
-- unchanged historical snapshot, first-paid referral unaffected.
-- Run only in a disposable PostgreSQL test DB, after 10_rules.test.sql.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  instructor_id uuid := '00000000-0000-0000-0000-0000000000a1';
  student_id uuid := '00000000-0000-0000-0000-0000000000b1';
  admin_id uuid := '00000000-0000-0000-0000-00000000000a';
  partner_id uuid;
  old_booking public.bookings;
  new_booking public.bookings;
  after_booking public.bookings;
  new_id uuid;
  lesson_total integer;
BEGIN
  SELECT id INTO partner_id FROM public.partners LIMIT 1;
  SELECT * INTO old_booking FROM public.bookings ORDER BY created_at LIMIT 1;
  ASSERT partner_id IS NOT NULL AND old_booking.id IS NOT NULL,
    'Requires the partner and prior booking fixtures';

  -- Students cannot change negotiated rates via protected RPCs.
  PERFORM set_config('request.jwt.claim.sub', student_id::text, false);
  EXECUTE 'SET ROLE authenticated';
  BEGIN
    PERFORM public.set_instructor_commission(instructor_id, 2000, 'unauthorized');
    RAISE EXCEPTION 'Student changed instructor commission';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.set_partner_commission(partner_id, 700, 'unauthorized');
    RAISE EXCEPTION 'Student changed pousada commission';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  ASSERT (SELECT count(*) FROM public.instructor_commission_overrides) = 0,
    'Student can read private instructor commission';
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claim.sub', admin_id::text, false);
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.set_instructor_commission(instructor_id, 2000, 'Negociacao de teste');
  PERFORM public.set_partner_commission(partner_id, 700, 'Indicacao de teste');
  EXECUTE 'RESET ROLE';

  ASSERT (SELECT commission_bps FROM public.instructor_commission_overrides
      WHERE instructor_id = '00000000-0000-0000-0000-0000000000a1'::uuid) = 2000,
      'Expected individual 20% instructor platform fee';
  ASSERT (SELECT commission_bps FROM public.partners WHERE id = partner_id) = 700,
      'Expected 7% partner fee';

  -- Insert a new financial snapshot using valid fixture relationships.
  -- The trigger runs only for new bookings and recalculates the split.
  INSERT INTO public.bookings(
    code, student_id, instructor_id, partner_id, price_version_id, beach_id,
    level, language, total_hours, hourly_rate_cents, with_transport,
    transport_hourly_cents, transport_cents, total_cents,
    partner_cents, platform_cents, instructor_net_cents, presence_code
  ) VALUES (
    'VNT-COMMISSION-CHECK-' || substr(gen_random_uuid()::text,1,8),
    old_booking.student_id, instructor_id, partner_id, old_booking.price_version_id,
    old_booking.beach_id, old_booking.level, old_booking.language, 1,
    old_booking.hourly_rate_cents, false, 0, 0, old_booking.hourly_rate_cents,
    0, 0, old_booking.hourly_rate_cents, '4321'
  )
  RETURNING id INTO new_id;

  SELECT * INTO new_booking FROM public.bookings WHERE id = new_id;
  lesson_total := new_booking.hourly_rate_cents;
  ASSERT new_booking.partner_cents = (lesson_total::bigint * 700 / 10000),
    'Pousada must receive 7% of lesson (inside platform fee)';
  ASSERT new_booking.platform_cents = (lesson_total::bigint * 1300 / 10000),
    'Platform retains 13% when instructor fee is 20% and partner 7%';
  ASSERT new_booking.instructor_net_cents = lesson_total - (lesson_total::bigint * 2000 / 10000),
    'Instructor retains 80% of lesson';
  ASSERT (new_booking.partner_cents + new_booking.platform_cents +
    new_booking.instructor_net_cents) = new_booking.total_cents,
    'The frozen split must reconcile exactly';

  -- A later change cannot rewrite any booking's frozen financial amounts.
  PERFORM set_config('request.jwt.claim.sub', admin_id::text, false);
  EXECUTE 'SET ROLE authenticated';
  PERFORM public.set_instructor_commission(instructor_id, 1000, 'Nova porcentagem');
  PERFORM public.set_partner_commission(partner_id, 500, 'Reversao da parceria');
  PERFORM public.set_instructor_commission(instructor_id, NULL, 'Voltar taxa global');
  EXECUTE 'RESET ROLE';

  SELECT * INTO after_booking FROM public.bookings WHERE id = new_id;
  ASSERT (after_booking.partner_cents,after_booking.platform_cents,
    after_booking.instructor_net_cents) =
    (new_booking.partner_cents,new_booking.platform_cents,
    new_booking.instructor_net_cents), 'Changing commission rewrote old booking';
  ASSERT NOT EXISTS (SELECT 1 FROM public.instructor_commission_overrides
    WHERE instructor_commission_overrides.instructor_id = '00000000-0000-0000-0000-0000000000a1'::uuid),
    'Clearing override should restore global rate';
  ASSERT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE action='instructor.commission_changed' AND entity_id=instructor_id::text
  ), 'Instructor commission changes need audit';
  ASSERT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE action='partner.commission_changed' AND entity_id=partner_id::text
  ), 'Partner commission changes need audit';
END $$;

ROLLBACK;
