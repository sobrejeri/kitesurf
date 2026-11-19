-- #93 (e #103, cenário 3): janela em que o instrutor pode INICIAR um encontro. Teste de CARACTERIZAÇÃO do comportamento real.
--
-- DIVERGÊNCIA registrada: as issues #93 e #103 dizem "instrutor inicia 24h antes quando permitido" / "janela de início (24h antes)".
-- O código (start_ordered_meeting, migration 20261102000026) NÃO usa 24 horas: libera pelo DIA DO CALENDÁRIO em Fortaleza.
--   - encontro de AMANHÃ (qualquer hora, mesmo 00:05) -> bloqueado ("Meeting day has not arrived"), mesmo a poucas horas de distância;
--   - encontro de HOJE (qualquer hora, mesmo 23:55, muitas horas à frente) -> liberado;
--   - encontro de dias passados e ainda não iniciado -> liberado.
-- Este teste fixa esse comportamento para que qualquer mudança (para 24h reais ou outra regra) seja uma decisão explícita de produto,
-- não um efeito colateral. NÃO é aprovação da regra. Banco descartável; tudo revertido no ROLLBACK; pagamento é o simulado do banco de teste.
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
  v_today := (now() at time zone 'America/Fortaleza')::date;   -- meia-noite local de hoje

  -- 1. Encontro de AMANHA 00:05 (local): bloqueado, mesmo que falte pouco tempo.
  update public.booking_meetings set starts_at = ((v_today + interval '1 day 5 minutes') at time zone 'America/Fortaleza') where id = m1;
  r := pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', m1, v_pin), a1);
  assert r like '55000:%day has not arrived%', 'amanha 00:05 deveria estar bloqueado (regra: dia do calendario): ' || r;

  -- 2. Encontro de HOJE 23:55 (local): liberado, mesmo muitas horas antes (nao e "24h antes", e "no dia").
  update public.booking_meetings set starts_at = ((v_today + interval '23 hours 55 minutes') at time zone 'America/Fortaleza') where id = m1;
  r := pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', m1, v_pin), a1);
  assert r = 'ok', 'hoje 23:55 deveria estar liberado (regra: dia do calendario): ' || r;
  assert (select status::text from public.booking_meetings where id = m1) = 'in_progress', 'o encontro deveria estar em andamento';
  r := pg_temp.try(format('select public.record_meeting(%L, 0, ''encerrado no teste'')', m1), a1);
  assert r = 'ok', 'registrar 0 minutos para voltar ao estado: ' || r;

  -- 3. Encontro de ONTEM ainda nao iniciado: liberado (inicio tardio). O registro depende so do instrutor.
  update public.booking_meetings set status = 'scheduled', started_at = null, done_minutes = 0, note = null, recorded_at = null, starts_at = now() - interval '1 day' where id = m1;
  update public.bookings set status = 'confirmed' where id = v_bk;
  r := pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', m1, v_pin), a1);
  assert r = 'ok', 'encontro de ontem ainda agendado pode ser iniciado: ' || r;
end $$;
rollback;
select 'PASS (caracterizacao): inicio liberado pelo dia do calendario de Fortaleza, nao por 24h; divergencia com #93/#103 documentada' as result;
