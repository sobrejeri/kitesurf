-- #91: turnos, pausas (intervalo mínimo), bloqueios/férias e fuso de Fortaleza na agenda do instrutor.
-- Complementa 20_availability. Banco descartável, tudo revertido no ROLLBACK.
--  A) FUSO: o dia da semana e o turno valem no horário de Fortaleza, não em UTC (22h local de segunda já é terça em UTC)
--  B) bordas do turno: terminar exatamente no fechamento é aceito; passar um minuto, começar antes da abertura ou atravessar a meia-noite não
--  C) bloqueios (férias, exceções): intervalo semiaberto [início, fim); encosta é aceito, sobrepor não; bloqueio de vários dias
--  D) pausa entre aulas (buffer_minutes): respeita o intervalo dos dois lados e deixa a borda exata livre
--  E) horário recusado continua recusado pela RPC create_booking (não só pela função auxiliar)
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

-- instante local de Fortaleza: d (data) + hh:mm
create function pg_temp.loc(d date, hhmm text) returns timestamptz language sql as $$
  select ((d + hhmm::time) at time zone 'America/Fortaleza')
$$;
create function pg_temp.can(who uuid, st timestamptz, hours int) returns boolean language sql as $$
  select public.instructor_can_attend(who, jsonb_build_array(jsonb_build_object('starts_at', st, 'hours', hours)))
$$;

do $$
declare
  a1 constant uuid := '00000000-0000-0000-0000-0000000000a1';
  stu constant uuid := '00000000-0000-0000-0000-0000000000b2';
  v_jeri uuid; mon date; tue date; r text; v_to uuid; v_id uuid;
begin
  select id into strict v_jeri from public.beaches where slug = 'jeri';
  -- uma segunda-feira futura (local) e a terca seguinte, sem nenhuma reserva do instrutor por perto
  select d into mon from (select ((now() at time zone 'America/Fortaleza')::date + g) d from generate_series(14, 120) g) x
   where extract(dow from d) = 1
     and not exists (select 1 from public.booking_meetings m join public.bookings k on k.id = m.booking_id
                      where k.instructor_id = a1 and m.status::text <> 'cancelled' and k.status::text in ('confirmed', 'awaiting_payment')
                        and m.starts_at between pg_temp.loc(d - 1, '00:00') and pg_temp.loc(d + 3, '00:00'))
   order by d limit 1;
  tue := mon + 1;
  assert mon is not null, 'FIXTURE: sem segunda-feira livre';

  -- A) turno so de segunda, 08:00-23:00 (sem terca). 22:00 local de segunda e 01:00 UTC de TERCA.
  r := pg_temp.try('select public.save_my_schedule(array[1], ''08:00'', ''23:00'', 0)', a1);
  assert r = 'ok', 'save_my_schedule: ' || r;
  assert (select weekday from public.instructor_weekly_hours where instructor_id = a1 order by weekday limit 1) = 1 and (select count(*) from public.instructor_weekly_hours where instructor_id = a1) = 1, 'so a segunda deveria estar configurada';
  assert pg_temp.can(a1, pg_temp.loc(mon, '22:00'), 1), 'A: 22:00 local de segunda e atendimento de segunda (mesmo sendo terca em UTC)';
  assert extract(dow from pg_temp.loc(mon, '22:00') at time zone 'UTC') = 2, 'A: o fixture precisa cair em terca em UTC para provar o fuso';
  assert not pg_temp.can(a1, pg_temp.loc(tue, '09:00'), 1), 'A: terca nao tem turno';
  assert not pg_temp.can(a1, pg_temp.loc(tue, '00:30') , 1), 'A: terca 00:30 local nao tem turno';

  -- B) bordas do turno de segunda (08:00-23:00)
  assert pg_temp.can(a1, pg_temp.loc(mon, '08:00'), 1), 'B: comecar exatamente na abertura e aceito';
  assert not pg_temp.can(a1, pg_temp.loc(mon, '07:30'), 1), 'B: comecar antes da abertura e recusado';
  assert pg_temp.can(a1, pg_temp.loc(mon, '22:00'), 1), 'B: terminar exatamente no fechamento (23:00) e aceito';
  assert not pg_temp.can(a1, pg_temp.loc(mon, '22:30'), 1), 'B: passar do fechamento por 30 min e recusado';
  assert not pg_temp.can(a1, pg_temp.loc(mon, '22:30'), 2), 'B: atravessar a meia-noite e recusado';
  assert not pg_temp.can(a1, pg_temp.loc(mon, '23:30'), 1), 'B: 23:30 + 1h atravessa a meia-noite e fica fora do turno';

  -- C) bloqueios: 10:00-12:00 de segunda
  r := pg_temp.try(format('select public.block_my_time(%L, %L, ''consulta'')', pg_temp.loc(mon, '10:00'), pg_temp.loc(mon, '12:00')), a1);
  assert r = 'ok', 'block_my_time: ' || r;
  select id into v_to from public.instructor_time_off where instructor_id = a1 and starts_at = pg_temp.loc(mon, '10:00');
  assert pg_temp.can(a1, pg_temp.loc(mon, '08:00'), 2), 'C: terminar exatamente no inicio do bloqueio (10:00) e aceito';
  assert pg_temp.can(a1, pg_temp.loc(mon, '12:00'), 1), 'C: comecar exatamente no fim do bloqueio (12:00) e aceito';
  assert not pg_temp.can(a1, pg_temp.loc(mon, '09:00'), 2), 'C: sobrepor o inicio do bloqueio e recusado';
  assert not pg_temp.can(a1, pg_temp.loc(mon, '11:00'), 2), 'C: sobrepor o fim do bloqueio e recusado';
  assert not pg_temp.can(a1, pg_temp.loc(mon, '10:00'), 1), 'C: dentro do bloqueio e recusado';
  r := pg_temp.try(format('select public.unblock_my_time(%L)', v_to), a1);
  assert r = 'ok' and pg_temp.can(a1, pg_temp.loc(mon, '10:00'), 1), 'C: desbloquear libera o horario: ' || r;
  -- ferias de varios dias (segunda 00:00 ate quarta 00:00 local) bloqueiam o turno inteiro de segunda
  r := pg_temp.try(format('select public.block_my_time(%L, %L, ''ferias'')', pg_temp.loc(mon, '00:00'), pg_temp.loc(mon + 2, '00:00')), a1);
  assert r = 'ok' and not pg_temp.can(a1, pg_temp.loc(mon, '09:00'), 1) and not pg_temp.can(a1, pg_temp.loc(mon, '22:00'), 1), 'C: ferias bloqueiam o dia inteiro: ' || r;
  delete from public.instructor_time_off where instructor_id = a1 and reason = 'ferias';

  -- D) pausa de 30 min entre aulas. Reserva real de segunda 10:00-12:00 (2h).
  perform pg_temp.try('select public.save_my_schedule(array[1], ''08:00'', ''23:00'', 30)', a1);
  assert (select buffer_minutes from public.instructor_schedule_settings where instructor_id = a1) = 30, 'D: pausa de 30 min gravada';
  perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
  v_id := public.create_booking(v_jeri, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', pg_temp.loc(mon, '10:00'), 'hours', 2)));
  execute 'reset role';
  assert (select instructor_id from public.bookings where id = v_id) = a1, 'D: a reserva ficou com a1';
  assert not pg_temp.can(a1, pg_temp.loc(mon, '12:00'), 1), 'D: logo depois da aula (dentro da pausa) e recusado';
  assert not pg_temp.can(a1, pg_temp.loc(mon, '12:15'), 1), 'D: 15 min depois ainda esta na pausa';
  assert pg_temp.can(a1, pg_temp.loc(mon, '12:30'), 1), 'D: 30 min depois (borda exata da pausa) e aceito';
  assert not pg_temp.can(a1, pg_temp.loc(mon, '08:45'), 1), 'D: terminar 15 min antes da aula (dentro da pausa) e recusado';
  assert pg_temp.can(a1, pg_temp.loc(mon, '08:30'), 1), 'D: terminar 30 min antes da aula (borda exata) e aceito';
  assert not pg_temp.can(a1, pg_temp.loc(mon, '10:00'), 1), 'D: a propria aula ocupa o horario';

  -- E) a RPC create_booking aplica as mesmas regras (outro aluno, mesmo instrutor, praia onde so a1 atende)
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  foreach r in array array[
    format('select public.create_booking(%L, ''first_time'', ''Português'', jsonb_build_array(jsonb_build_object(''starts_at'', %L::timestamptz, ''hours'', 1)))', v_jeri, pg_temp.loc(mon, '12:00')),
    format('select public.create_booking(%L, ''first_time'', ''Português'', jsonb_build_array(jsonb_build_object(''starts_at'', %L::timestamptz, ''hours'', 1)))', v_jeri, pg_temp.loc(tue, '09:00')),
    format('select public.create_booking(%L, ''first_time'', ''Português'', jsonb_build_array(jsonb_build_object(''starts_at'', %L::timestamptz, ''hours'', 2)))', v_jeri, pg_temp.loc(mon, '22:30'))]
  loop
    declare res text := pg_temp.try(r, '00000000-0000-0000-0000-0000000000b1');
    begin assert res like 'P0001:%' and res like '%No instructor available%', 'E: horario fora da agenda deveria dar NO_INSTRUCTOR: ' || r || ' -> ' || res; end;
  end loop;
  r := pg_temp.try(format('select public.create_booking(%L, ''first_time'', ''Português'', jsonb_build_array(jsonb_build_object(''starts_at'', %L::timestamptz, ''hours'', 1)))', v_jeri, pg_temp.loc(mon, '12:30')), '00000000-0000-0000-0000-0000000000b1');
  assert r = 'ok', 'E: a borda exata da pausa deveria ser aceita pela RPC: ' || r;
end $$;
rollback;
select 'PASS: agenda do instrutor: fuso de Fortaleza, bordas do turno, bloqueios/ferias, pausa entre aulas e as mesmas regras na RPC' as result;
