-- Endurecimento de respond_balance_meeting (migration 20261120130000): o respondente precisa ser o instrutor ATUAL da reserva.
-- Every write stays inside one rolled-back transaction, never live production.
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.act_as(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claim.sub',uid::text,true); EXECUTE 'SET LOCAL ROLE authenticated'; END $$;
CREATE FUNCTION pg_temp.reset() RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claim.sub','',true); END $$;

-- Fresh students with no prior meetings, so the schedule-overlap guard is not
-- tripped by fixtures that other test files committed for the seeded students.
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('00000000-0000-0000-0000-0000000000f1','balstudent@test.invalid','{"full_name":"Saldo Aluno"}'),
 ('00000000-0000-0000-0000-0000000000f2','balother@test.invalid','{"full_name":"Saldo Outro"}');

-- Build a confirmed single-meeting test booking of p_hours, recorded short by
-- p_done_minutes so it keeps a balance. Returns the booking id.
CREATE FUNCTION pg_temp.short_booking(
  p_admin uuid, p_instructor uuid, p_student uuid, p_beach uuid,
  p_hours integer, p_done_minutes integer
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_bid uuid; v_mid uuid; v_pin text; v_start timestamptz;
BEGIN
  v_start:=(((now() AT TIME ZONE 'America/Fortaleza')::date+40)::timestamp+interval '9 hours') AT TIME ZONE 'America/Fortaleza';
  PERFORM pg_temp.act_as(p_admin);
  v_bid:=public.create_admin_test_booking(p_instructor,p_student,p_beach,
    jsonb_build_array(jsonb_build_object(
      'starts_at',to_char(v_start AT TIME ZONE 'America/Fortaleza','YYYY-MM-DD"T"HH24:MI:SS')||'-03:00',
      'hours',p_hours)));
  PERFORM pg_temp.reset();
  SELECT id INTO v_mid FROM public.booking_meetings WHERE booking_id=v_bid;
  SELECT presence_code INTO v_pin FROM public.bookings WHERE id=v_bid;
  -- Deliver the meeting short, inside the rollback, by dating it in the past.
  -- Place each prior short lesson in its own past slot. A 120-minute
  -- meeting ending now overlaps the later 30-minute make-up at now-10m;
  -- the guard must reject that, so keep fixtures chronologically distinct.
  UPDATE public.booking_meetings
     SET starts_at = now() - interval '4 hours' -
       ((SELECT count(*) FROM public.booking_meetings m
           JOIN public.bookings b ON b.id=m.booking_id
          WHERE b.student_id=p_student AND m.id<>v_mid) * interval '6 hours')
   WHERE id=v_mid;
  PERFORM pg_temp.act_as(p_instructor);
  PERFORM public.start_ordered_meeting(v_mid,v_pin);
  PERFORM public.record_meeting(v_mid,p_done_minutes,'short record for balance test');
  PERFORM pg_temp.reset();
  RETURN v_bid;
END $$;

DO $$
DECLARE
  v_student uuid:='00000000-0000-0000-0000-0000000000f1';
  v_old uuid:='00000000-0000-0000-0000-0000000000a2';
  v_admin uuid:='00000000-0000-0000-0000-00000000000a';
  v_new uuid; v_beach uuid; v_bid uuid; v_req uuid; v_before int;
BEGIN
  SELECT id INTO v_beach FROM public.beaches WHERE slug='prea';
  SELECT id INTO v_new FROM public.instructors WHERE status='approved' AND id<>v_old ORDER BY id LIMIT 1;
  ASSERT v_new IS NOT NULL, 'fixture: segundo instrutor aprovado';
  v_bid:=pg_temp.short_booking(v_admin,v_old,v_student,v_beach,2,90);
  PERFORM pg_temp.act_as(v_student);
  v_req:=public.request_balance_meeting(v_bid,now()+interval '5 days',30);
  PERFORM pg_temp.reset();

  -- A reserva troca de instrutor (substituicao) com o pedido de reposicao ainda pendente.
  UPDATE public.bookings SET instructor_id=v_new WHERE id=v_bid;
  SELECT count(*) INTO v_before FROM public.booking_meetings WHERE booking_id=v_bid;

  -- Quem saiu da reserva nao pode mais aceitar: nenhum encontro novo, pedido segue pendente.
  PERFORM pg_temp.act_as(v_old);
  BEGIN
    PERFORM public.respond_balance_meeting(v_req,true);
    RAISE EXCEPTION 'o instrutor que saiu da reserva aceitou a reposicao';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.reset();
  ASSERT (SELECT count(*) FROM public.booking_meetings WHERE booking_id=v_bid)=v_before, 'nenhum encontro deveria ter sido criado';
  ASSERT (SELECT status FROM public.balance_meeting_requests WHERE id=v_req)='pending', 'o pedido deveria seguir pendente';
END $$;
ROLLBACK;
SELECT 'PASS: respond_balance_meeting recusa o instrutor que saiu da reserva' AS result;
