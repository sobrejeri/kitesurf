-- P0 #93: presença, minutos e evolução de uma reserva de 4h em dois encontros.
-- Banco descartável, tudo revertido no ROLLBACK. Pagamento é o simulado do banco de teste (nunca dinheiro real).
-- Cobre: ordem dos encontros, código de presença, registro duplicado, minutos inválidos, 110+115 = 225 realizados / 15 restantes,
-- habilidades gravadas no encontro certo, e quem NÃO pode ler ou registrar.
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
  a2 constant uuid := '00000000-0000-0000-0000-0000000000a2';
  stu constant uuid := '00000000-0000-0000-0000-0000000000b2';
  other constant uuid := '00000000-0000-0000-0000-0000000000b1';
  v_beach uuid; d1 timestamptz; d2 timestamptz; v_bk uuid; m1 uuid; m2 uuid; v_pin text; r text; v_n int; v_bal int;
begin
  select id into strict v_beach from public.beaches where slug = 'jeri';
  -- Dois dias distintos livres para o instrutor e para o aluno.
  select a.st, b.st into d1, d2
  from (select (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => d, hours => h)) at time zone 'America/Fortaleza' st
        from generate_series(3, 90) d cross join generate_series(8, 14) h) a
  join (select (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => d, hours => h)) at time zone 'America/Fortaleza' st
        from generate_series(3, 90) d cross join generate_series(8, 14) h) b
    on (b.st at time zone 'America/Fortaleza')::date > (a.st at time zone 'America/Fortaleza')::date
  where public.instructor_can_attend(a1, jsonb_build_array(jsonb_build_object('starts_at', a.st, 'hours', 2), jsonb_build_object('starts_at', b.st, 'hours', 2)))
    and not exists (select 1 from public.booking_meetings m join public.bookings k on k.id = m.booking_id
        where k.student_id = stu and m.status::text <> 'cancelled' and k.status::text in ('confirmed', 'awaiting_payment')
          and tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.minutes), '[)') && any (array[tstzrange(a.st, a.st + interval '2 hours', '[)'), tstzrange(b.st, b.st + interval '2 hours', '[)')]))
  order by a.st, b.st limit 1;
  if d1 is null then raise exception 'FIXTURE: sem dois dias livres'; end if;

  perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
  v_bk := public.create_booking(v_beach, 'first_time', 'Português',
    jsonb_build_array(jsonb_build_object('starts_at', d1, 'hours', 2), jsonb_build_object('starts_at', d2, 'hours', 2)));
  perform public.simulate_test_payment(v_bk, 'pix', 'approved');
  execute 'reset role';
  assert (select status::text from public.bookings where id = v_bk) = 'confirmed', 'reserva paga (simulada) deve ficar confirmed';
  select id into m1 from public.booking_meetings where booking_id = v_bk and position = 1;
  select id into m2 from public.booking_meetings where booking_id = v_bk and position = 2;
  select presence_code into v_pin from public.bookings where id = v_bk;
  -- Os dois encontros "acontecem" em dois horarios passados e separados (so dentro desta transacao revertida).
  update public.booking_meetings set starts_at = now() - interval '6 hours' where id = m1;
  update public.booking_meetings set starts_at = now() - interval '3 hours' where id = m2;

  -- Ordem: o 2o nao inicia antes do 1o terminar.
  r := pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', m2, v_pin), a1);
  assert r like '55000:%previous%', 'iniciar o encontro 2 antes do 1 deveria falhar: ' || r;
  -- Codigo de presenca errado ou outro instrutor.
  r := pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', m1, case when v_pin = '0000' then '1111' else '0000' end), a1);
  assert r <> 'ok' and r ilike '%presence%', 'codigo de presenca errado deveria falhar: ' || r;
  r := pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', m1, v_pin), a2);
  assert r like 'P0002:%', 'outro instrutor nao pode iniciar o encontro: ' || r;
  assert (select status::text from public.booking_meetings where id = m1) = 'scheduled', 'tentativas invalidas nao podem iniciar o encontro';

  -- Registrar antes de iniciar falha.
  r := pg_temp.try(format('select public.record_meeting(%L, 60, ''x'')', m1), a1);
  assert r like '55000:%', 'registrar sem iniciar deveria falhar: ' || r;

  -- Inicio correto; iniciar de novo falha.
  r := pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', m1, v_pin), a1);
  assert r = 'ok', 'inicio correto falhou: ' || r;
  r := pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', m1, v_pin), a1);
  assert r like '55000:%', 'iniciar duas vezes deveria falhar: ' || r;

  -- Minutos invalidos (NULL, negativo, acima de 120) e habilidades invalidas: nada e gravado e o encontro segue em andamento.
  foreach r in array array[
    format('select public.record_meeting_with_skills(%L, NULL, array[1], array[]::int[])', m1),
    format('select public.record_meeting_with_skills(%L, -5, array[1], array[]::int[])', m1),
    format('select public.record_meeting_with_skills(%L, 121, array[1], array[]::int[])', m1),
    format('select public.record_meeting_with_skills(%L, 0, array[1], array[]::int[])', m1),
    format('select public.record_meeting_with_skills(%L, 60, array[]::int[], array[]::int[])', m1),
    format('select public.record_meeting_with_skills(%L, 60, array[1,1], array[]::int[])', m1),
    format('select public.record_meeting_with_skills(%L, 60, array[1], array[1])', m1),
    format('select public.record_meeting_with_skills(%L, 60, array[7], array[]::int[])', m1),
    format('select public.record_meeting_with_skills(%L, 60, NULL, array[1])', m1)]
  loop
    declare res text := pg_temp.try(r, a1);
    begin assert res like '22023:%', format('entrada invalida deveria dar 22023: %s -> %s', r, res); end;
  end loop;
  assert (select status::text from public.booking_meetings where id = m1) = 'in_progress', 'entrada invalida nao pode encerrar o encontro';
  assert (select count(*) from public.meeting_skill_progress where meeting_id = m1) = 0, 'entrada invalida nao pode gravar habilidades';
  -- Outro instrutor nao registra.
  r := pg_temp.try(format('select public.record_meeting_with_skills(%L, 110, array[1,2], array[3])', m1), a2);
  assert r like 'P0002:%', 'outro instrutor nao pode registrar: ' || r;

  -- Registro correto: 110 min, habilidades 1,2 praticadas e 3 dominada.
  r := pg_temp.try(format('select public.record_meeting_with_skills(%L, 110, array[1,2], array[3])', m1), a1);
  assert r = 'ok', 'registro correto de 110 falhou: ' || r;
  assert (select done_minutes from public.booking_meetings where id = m1) = 110 and (select status::text from public.booking_meetings where id = m1) = 'done', 'encontro 1 deveria ficar done com 110';
  assert (select status::text from public.bookings where id = v_bk) = 'confirmed', 'com saldo a reserva continua confirmed';

  -- Registro duplicado: nao muda minutos, habilidades nem auditoria.
  r := pg_temp.try(format('select public.record_meeting_with_skills(%L, 120, array[4], array[5])', m1), a1);
  assert r like '55000:%', 'registro duplicado deveria falhar: ' || r;
  r := pg_temp.try(format('select public.record_meeting(%L, 120, ''de novo'')', m1), a1);
  assert r like '55000:%', 'record_meeting duplicado deveria falhar: ' || r;
  assert (select done_minutes from public.booking_meetings where id = m1) = 110, 'duplicado alterou os minutos';
  assert (select count(*) from public.meeting_skill_progress where meeting_id = m1) = 3, 'duplicado alterou as habilidades';
  assert (select count(*) from public.audit_logs where entity_id = m1::text and action = 'meeting.recorded') = 1, 'duplicado gerou segunda auditoria';

  -- Encontro 2: 115 minutos, habilidade 4 praticada.
  r := pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', m2, v_pin), a1);
  assert r = 'ok', 'inicio do encontro 2 falhou: ' || r;
  r := pg_temp.try(format('select public.record_meeting_with_skills(%L, 115, array[4], array[]::int[])', m2), a1);
  assert r = 'ok', 'registro de 115 falhou: ' || r;

  -- Totais: 225 realizados, 15 restantes; a reserva so conclui com o saldo zerado.
  assert (select sum(done_minutes) from public.booking_meetings where booking_id = v_bk and status::text = 'done') = 225, 'total realizado deveria ser 225';
  assert (select status::text from public.bookings where id = v_bk) = 'confirmed', 'com 15 min de saldo a reserva NAO conclui';
  perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
  v_bal := public.booking_balance_minutes(v_bk);
  execute 'reset role';
  assert v_bal = 15, 'saldo deveria ser 15, obteve ' || coalesce(v_bal::text, 'null');

  -- Evolucao no encontro certo: cada habilidade esta no seu encontro, sem vazar para o outro.
  assert (select array_agg(step_number::int || ':' || result order by step_number) from public.meeting_skill_progress where meeting_id = m1) = array['1:practiced', '2:practiced', '3:mastered'], 'habilidades do encontro 1 erradas';
  assert (select array_agg(step_number::int || ':' || result order by step_number) from public.meeting_skill_progress where meeting_id = m2) = array['4:practiced'], 'habilidades do encontro 2 erradas';

  -- Leitura: o aluno dono e o instrutor veem; outro aluno nao ve nada.
  perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
  select count(*) into v_n from public.meeting_skill_progress where meeting_id in (m1, m2); execute 'reset role';
  assert v_n = 4, 'o aluno dono deveria ler as 4 habilidades, leu ' || v_n;
  perform set_config('request.jwt.claim.sub', other::text, true); execute 'set local role authenticated';
  select count(*) into v_n from public.meeting_skill_progress where meeting_id in (m1, m2); execute 'reset role';
  assert v_n = 0, 'IDOR: outro aluno leu habilidades do encontro';
  -- Um aluno nao consulta o saldo de reserva alheia: ou falha, ou nao devolve o saldo real.
  declare v_other_bal int; v_failed boolean := false; begin
    perform set_config('request.jwt.claim.sub', other::text, true); execute 'set local role authenticated';
    begin v_other_bal := public.booking_balance_minutes(v_bk); exception when others then v_failed := true; end;
    execute 'reset role';
    assert v_failed or v_other_bal is distinct from 15, 'IDOR: outro aluno obteve o saldo real da reserva';
  end;
end $$;
rollback;
select 'PASS: presenca, ordem, duplicidade, minutos invalidos, 110+115=225 (saldo 15) e habilidades no encontro certo' as result;
