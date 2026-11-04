\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.act_as(uid text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claim.sub',uid,false); EXECUTE 'SET ROLE authenticated'; END $$;
CREATE FUNCTION pg_temp.reset() RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claim.sub','',false); END $$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(
  '00000000-0000-0000-0000-000000000b36','level-prices@test',
  '{"full_name":"Level prices fixture","self_reported_kite_level":"first_time"}');
UPDATE public.profiles SET self_reported_kite_level='first_time'
  WHERE id='00000000-0000-0000-0000-000000000b36';
UPDATE public.instructors SET has_support_vehicle=true;
DO $$
DECLARE
  old public.bookings; initial_version bigint; version_id bigint; later_id bigint;
  beach uuid; bid uuid; pending uuid; offer uuid; teacher uuid; booked public.bookings;
  plan jsonb; lvl public.lesson_level; expected integer; day_offset integer:=360; quoted record;
BEGIN
  SELECT * INTO old FROM public.bookings ORDER BY created_at LIMIT 1;
  SELECT id INTO initial_version FROM public.price_versions ORDER BY id DESC LIMIT 1;
  SELECT id INTO beach FROM public.beaches WHERE slug='prea';
  -- Existing versions retain a common rate until the admin publishes a change.
  ASSERT (SELECT count(DISTINCT hourly_rate_cents) FROM public.quote_table_by_level())=1;
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000000b36');
  BEGIN
    PERFORM public.publish_level_price_version(30000,40050,50000,1500,10000,'Denied',initial_version);
    RAISE EXCEPTION 'Student published prices';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.reset();
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
  version_id:=public.publish_level_price_version(30000,40050,50000,1500,10000,'Three independent rates',initial_version);
  BEGIN
    PERFORM public.publish_level_price_version(30000,40050,50000,1500,10000,'Stale session',initial_version);
    RAISE EXCEPTION 'Stale prices overwritten';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  BEGIN
    PERFORM public.publish_level_price_version(30000,-1,50000,1500,10000,'Invalid rate',version_id);
    RAISE EXCEPTION 'Negative price accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM pg_temp.reset();
  EXECUTE 'SET ROLE anon';
  ASSERT (SELECT count(*) FROM public.quote_table_by_level())=24;
  ASSERT (SELECT total_cents FROM public.quote_table_by_level() WHERE level='returning' AND hours=2)=80100;
  ASSERT (SELECT total_with_transport_cents FROM public.quote_table_by_level() WHERE level='improving' AND hours=2)=120000;
  EXECUTE 'RESET ROLE';
  -- Exercise the direct booking RPC for all three levels, not just fixture INSERTs.
  FOREACH lvl IN ARRAY ARRAY['first_time','returning','improving']::public.lesson_level[] LOOP
    plan:=jsonb_build_array(jsonb_build_object('starts_at',
      (((now() AT TIME ZONE 'America/Fortaleza')::date+day_offset)::timestamp+interval '10 hours') AT TIME ZONE 'America/Fortaleza','hours',2));
    expected:=CASE lvl WHEN 'first_time' THEN 30000 WHEN 'returning' THEN 40050 ELSE 50000 END;
    PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000000b36');
    bid:=public.create_booking(beach,lvl,'Português',plan,null,false);
    PERFORM pg_temp.reset();
    SELECT * INTO booked FROM public.bookings WHERE id=bid;
    ASSERT booked.hourly_rate_cents=expected AND booked.total_cents=2*expected,
      'Direct booking used the wrong level rate';
    ASSERT booked.partner_cents+booked.platform_cents+booked.instructor_net_cents=booked.total_cents;
    day_offset:=day_offset+1;
  END LOOP;
  plan:=jsonb_build_array(jsonb_build_object('starts_at',
    (((now() AT TIME ZONE 'America/Fortaleza')::date+370)::timestamp+interval '10 hours') AT TIME ZONE 'America/Fortaleza','hours',2));
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000000b36');
  pending:=public.create_instructor_request(beach,'improving','Português',plan,'MAR-E-VENTO',true);
  PERFORM pg_temp.reset();
  SELECT id,instructor_id INTO offer,teacher FROM public.instructor_offers WHERE request_id=pending AND status='offered';
  ASSERT offer IS NOT NULL,'Expected a compatible instructor offer';
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
  PERFORM public.set_instructor_commission(teacher,2000,'Level fee integration');
  later_id:=public.publish_level_price_version(60000,70000,80000,1500,10000,'Later prices',version_id);
  PERFORM pg_temp.reset();
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000000b36');
  SELECT * INTO quoted FROM public.my_instructor_request_quote(pending);
  ASSERT quoted.hourly_rate_cents=50000 AND quoted.total_cents=120000 AND quoted.transport_cents=20000,
    'Searching page must quote the pinned level price and transport';
  PERFORM pg_temp.reset();
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
  BEGIN
    PERFORM public.my_instructor_request_quote(pending);
    RAISE EXCEPTION 'Unrelated student read request quote';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  PERFORM pg_temp.reset();
  PERFORM pg_temp.act_as(teacher::text);
  bid:=public.accept_instructor_offer(offer);
  PERFORM pg_temp.reset();
  SELECT * INTO booked FROM public.bookings WHERE id=bid;
  ASSERT booked.id IS NOT NULL AND booked.price_version_id=version_id AND booked.hourly_rate_cents=50000,
    'Instructor acceptance must retain the request price version';
  ASSERT booked.total_cents=120000 AND booked.transport_cents=20000;
  ASSERT booked.partner_cents=5000 AND booked.platform_cents=15000 AND booked.instructor_net_cents=100000,
    'Level rate must precede individual commission; transport goes to instructor';
  UPDATE public.profiles SET assessed_kite_level='returning'
    WHERE id='00000000-0000-0000-0000-000000000b36';
  ASSERT (SELECT hourly_rate_cents FROM public.bookings WHERE id=bid)=50000,
    'Changing recommended student level rewrote a booked price';
  ASSERT (SELECT total_cents FROM public.bookings WHERE id=old.id)=old.total_cents,
    'Publishing rewrote a historical booking';
  BEGIN
    UPDATE public.bookings SET hourly_rate_cents=1 WHERE id=bid;
    RAISE EXCEPTION 'Frozen price was changed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  ASSERT EXISTS(SELECT 1 FROM public.audit_logs WHERE action='price.levels_published' AND entity_id=later_id::text);
END $$;
ROLLBACK;
