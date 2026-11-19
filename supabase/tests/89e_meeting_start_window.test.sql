-- #93 (e #103, cenario 3): janela de INICIO do encontro = ate 24h antes do horario agendado (decisao do responsavel, 19/11/2026; migration 20261120120000).
-- Banco descartavel; tudo revertido no ROLLBACK; pagamento e o simulado do banco de teste.
\set ON_ERROR_STOP on
begin;

create function pg_temp.try(q text, who uuid) returns text language plpgsql as $$
declare st text; msg text;
begin
  perform set_config('request.jwt.claim.sub', who::text, true);
  execute 'set local role authenticated';
  begin execute q; exception when others then get stacked diagnostics msg = message_text; st := sqlstate; end;
  execute 'reset role';
  return coalesce(st || ':' || msg, 'ok');
end $$;

do $$
declare
  a1 constant uuid := '00000000-0000-0000-0000-0000000000a1';
  stu constant uuid := '00000000-0000-0000-0000-0000000000b2';
  v_beach uuid; v_start timestamptz; v_bk uuid; m1 uuid; v_pin text; r text; v_today timestamp;
begin
  select id into strict v_beach from public.beaches where slug = 'jeri';
  select c.st into v_start
  from (select (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => d, hours => h)) at time zone 'America/Fortaleza' st
        from generate_series(4, 120) d cross join generate_series(8, 10) h) c
  where public.instructor_can_attend(a1, jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', 1)))
    and not exists (select 1 from public.booking_meetings m join public.bookings k on k.id = m.booking_id
        where k.student_id = stu and m.status::text <> 'cancelled' and k.status::text in ('confirmed', 'awaiting_payment')
          and tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.minutes), '[)') && tstzrange(c.st - interval '2 days', c.st + interval '2 days', '[)'))
  order by c.st limit 1;
  if v_start is null then raise exception 'FIXTURE: sem horario livre'; end if;

  perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
  v_bk := public.create_booking(v_beach, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', v_start, 'hours', 1)));
  perform public.simulate_test_payment(v_bk, 'pix', 'approved');
  execute 'reset role';
  select id into m1 from public.booking_meetings where booking_id = v_bk;
  select presence_code into v_pin from public.bookings where id = v_bk;
  -- Regra decidida pelo responsavel (19/11/2026): inicio liberado quando faltam 24h ou menos (instante absoluto; independe do fuso).
  update public.booking_meetings set starts_at = now() + interval '24 hours 5 minutes' where id = m1;
  r := pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', m1, v_pin), a1);
  assert r like '55000:%start window has not opened%', '24h05 antes deveria estar bloqueado: ' || r;
  update public.booking_meetings set starts_at = now() + interval '25 hours' where id = m1;
  r := pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', m1, v_pin), a1);
  assert r like '55000:%start window has not opened%', '25h antes deveria estar bloqueado: ' || r;
  update public.booking_meetings set starts_at = now() + interval '23 hours 55 minutes' where id = m1;
  r := pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', m1, v_pin), a1);
  assert r = 'ok', '23h55 antes deveria estar liberado: ' || r;
  assert (select status::text from public.booking_meetings where id = m1) = 'in_progress', 'o encontro deveria estar em andamento';
  r := pg_temp.try(format('select public.record_meeting(%L, 0, ''encerrado no teste'')', m1), a1);
  assert r = 'ok', 'registrar 0 minutos para voltar ao estado: ' || r;
  -- Encontro de ontem ainda nao iniciado: liberado (inicio tardio).
  update public.booking_meetings set status = 'scheduled', started_at = null, done_minutes = 0, note = null, recorded_at = null, starts_at = now() - interval '1 day' where id = m1;
  update public.bookings set status = 'confirmed' where id = v_bk;
  r := pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', m1, v_pin), a1);
  assert r = 'ok', 'encontro de ontem ainda agendado pode ser iniciado: ' || r;
end $$;
rollback;
select 'PASS: inicio liberado ate 24h antes do horario agendado (decisao do responsavel); bloqueado antes disso' as result;
