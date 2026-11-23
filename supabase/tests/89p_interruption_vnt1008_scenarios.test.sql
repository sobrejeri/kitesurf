-- Lote de 10, item 5: cenário tipo VNT-1008 (4 h = 2 encontros de 120 min; 110 + 115 = 225/240) nos DOIS caminhos, mais limites de duração,
-- chamadas repetidas e não antecipação. Banco descartável; tudo revertido (ROLLBACK).
--   S1 caminho LEGADO (flag desligada): 110 + 115 deixam a reserva confirmada com saldo de 15 min (comportamento preservado).
--   S2 caminho NOVO normal: 110 + 115 CONCLUEM a reserva; 225 entregues; o saldo legado não é utilizável (reposição recusada).
--   S3 caminho NOVO com interrupção: interrompe em 110 (restam 10) e em 115 (restam 5); retomadas fecham 120 + 120 = 240/240.
--   S4 limites; S5 repetições; S6 não antecipação.
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
create function pg_temp.free_slot(p_from int, p_to int, p_hours int) returns timestamptz language sql as $$
  select c.st from (select (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => d, hours => h)) at time zone 'America/Fortaleza' st
    from generate_series(p_from, p_to) d cross join generate_series(7, 10) h) c
  where c.st > now() + interval '2 hours'
    and public.instructor_can_attend('00000000-0000-0000-0000-0000000000a1', jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', p_hours)))
    and not exists (select 1 from public.booking_meetings m join public.bookings k on k.id = m.booking_id
        where k.student_id = '00000000-0000-0000-0000-0000000000b2' and m.status::text <> 'cancelled' and k.status::text in ('confirmed', 'awaiting_payment')
          and tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.minutes), '[)') && tstzrange(c.st - interval '4 hours', c.st + interval '4 hours', '[)'))
  order by c.st limit 1 $$;
-- Reserva 4 h em 2 encontros de 120 min (hours => 2). Encontro 1 "aconteceu" há p_ago horas; encontro 2 há p_ago2 horas (p_ago2 = 0 deixa o 2 no futuro).
create function pg_temp.mk4h(p_ago int, p_ago2 int, out bk uuid, out m1 uuid, out m2 uuid, out pin text) language plpgsql as $$
declare d1 timestamptz; d2 timestamptz;
begin
  d1 := pg_temp.free_slot(3, 80, 2);
  d2 := pg_temp.free_slot(((d1 at time zone 'America/Fortaleza')::date - (now() at time zone 'America/Fortaleza')::date) + 3, 200, 2);
  if d1 is null or d2 is null then raise exception 'FIXTURE: sem horarios livres'; end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true); execute 'set local role authenticated';
  bk := public.create_booking((select id from public.beaches where slug = 'jeri'), 'first_time', 'Português',
    jsonb_build_array(jsonb_build_object('starts_at', d1, 'hours', 2), jsonb_build_object('starts_at', d2, 'hours', 2)));
  perform public.simulate_test_payment(bk, 'pix', 'approved');
  execute 'reset role';
  assert (select total_hours from public.bookings where id = bk) = 4 and (select count(*) from public.booking_meetings where booking_id = bk and minutes = 120) = 2, 'FIXTURE: 4h em 2 x 120';
  assert (select instructor_id from public.bookings where id = bk) = '00000000-0000-0000-0000-0000000000a1'::uuid, 'FIXTURE: instrutor a1';
  select id into m1 from public.booking_meetings where booking_id = bk and position = 1;
  select id into m2 from public.booking_meetings where booking_id = bk and position = 2;
  select presence_code into pin from public.bookings where id = bk;
  update public.booking_meetings set starts_at = now() - make_interval(hours => p_ago) where id = m1;
  if p_ago2 > 0 then update public.booking_meetings set starts_at = now() - make_interval(hours => p_ago2) where id = m2; end if;   -- 0 = encontro 2 segue no futuro
end $$;
create function pg_temp.balance(p_bk uuid) returns int language plpgsql as $$
declare r int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true); execute 'set local role authenticated';
  r := public.booking_balance_minutes(p_bk); execute 'reset role'; return r;
end $$;

do $$
declare
  a1 constant uuid := '00000000-0000-0000-0000-0000000000a1'; stu constant uuid := '00000000-0000-0000-0000-0000000000b2';
  v record; r text; t timestamptz; s text; sum_done int;
  none text := 'array[]::int[]';
begin
  -- ===== S1: caminho LEGADO (110 + 115): reserva confirmada, saldo 15 =====
  select * into v from pg_temp.mk4h(30, 20);
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m1, v.pin), a1) = 'ok', 'S1 inicio 1';
  assert pg_temp.try(format('select public.record_meeting_with_skills(%L, 110, array[1], array[]::int[])', v.m1), a1) = 'ok', 'S1 legado 110';
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m2, v.pin), a1) = 'ok', 'S1 inicio 2';
  assert pg_temp.try(format('select public.record_meeting_with_skills(%L, 115, array[2], array[]::int[])', v.m2), a1) = 'ok', 'S1 legado 115';
  assert (select sum(done_minutes) from public.booking_meetings where booking_id = v.bk) = 225, 'S1 225 realizados';
  assert (select status::text from public.bookings where id = v.bk) = 'confirmed', 'S1 legado: reserva fica confirmada (comportamento preservado)';
  assert pg_temp.balance(v.bk) = 15, 'S1 saldo legado = 15';

  -- ===== S2: caminho NOVO normal (110 + 115): conclui sem saldo utilizável =====
  select * into v from pg_temp.mk4h(60, 50);
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m1, v.pin), a1) = 'ok', 'S2 inicio 1';
  assert pg_temp.try(format('select public.complete_meeting_with_skills(%L, 110, array[1], %s)', v.m1, none), a1) = 'ok', 'S2 normal 110';
  assert (select status::text from public.bookings where id = v.bk) = 'confirmed', 'S2 ainda ha o encontro 2';
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m2, v.pin), a1) = 'ok', 'S2 inicio 2';
  assert pg_temp.try(format('select public.complete_meeting_with_skills(%L, 115, array[2], %s)', v.m2, none), a1) = 'ok', 'S2 normal 115';
  assert (select sum(done_minutes + previous_done_minutes) from public.booking_meetings where booking_id = v.bk) = 225, 'S2 225 entregues';
  assert (select status::text from public.bookings where id = v.bk) = 'completed', 'S2 NOVO: a reserva conclui (sem exigir 240)';
  r := pg_temp.try(format('select public.request_balance_meeting(%L, now() + interval ''5 days'', 15)', v.bk), stu);
  assert r <> 'ok', 'S2 saldo de 15 min não pode virar pedido de reposição: ' || r;
  r := pg_temp.try(format('select public.close_booking_balance(%L)', v.bk), stu);
  assert r <> 'ok', 'S2 reserva já concluída não aceita encerrar saldo: ' || r;

  -- ===== S3: caminho NOVO com interrupção (110 + resto 10; 115 + resto 5) =====
  select * into v from pg_temp.mk4h(90, 0);
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m1, v.pin), a1) = 'ok', 'S3 inicio 1';
  assert pg_temp.try(format('select public.interrupt_meeting(%L, ''Vento caiu de repente na praia'', 110, 10, array[1], %s)', v.m1, none), a1) = 'ok', 'S3 interrompe em 110 (restam 10)';
  select * into strict s from (select format('%s/%s/%s/%s', status, interruption_state, previous_done_minutes, remaining_minutes) from public.booking_meetings where id = v.m1) x(s);
  assert s = 'scheduled/awaiting_resume/110/10', 'S3 estado após interromper: ' || s;
  t := pg_temp.free_slot(1, 20, 1);
  assert pg_temp.try(format('select public.schedule_meeting_resume(%L, %L)', v.m1, t), a1) = 'ok', 'S3 agenda 10 min';
  update public.booking_meetings set starts_at = now() + interval '1 hour' where id = v.m1;   -- (tempo de teste) abre a janela de 24 h
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m1, v.pin), a1) = 'ok', 'S3 retoma 1';
  assert pg_temp.try(format('select public.complete_meeting_with_skills(%L, 10, array[3], %s)', v.m1, none), a1) = 'ok', 'S3 fecha 1 (110 + 10 = 120)';
  assert (select previous_done_minutes + done_minutes from public.booking_meetings where id = v.m1) = 120, 'S3 encontro 1 = 120';
  update public.booking_meetings set starts_at = now() - interval '80 hours' where id = v.m2;   -- (tempo de teste) o encontro 2 "chega"
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m2, v.pin), a1) = 'ok', 'S3 inicio 2';
  assert pg_temp.try(format('select public.interrupt_meeting(%L, ''Vento caiu de repente na praia'', 115, 5, array[4], %s)', v.m2, none), a1) = 'ok', 'S3 interrompe em 115 (restam 5)';
  assert (select status::text from public.bookings where id = v.bk) = 'confirmed', 'S3 interrompido pendente: reserva não conclui';
  t := pg_temp.free_slot(2, 25, 1);
  assert pg_temp.try(format('select public.schedule_meeting_resume(%L, %L)', v.m2, t), a1) = 'ok', 'S3 agenda 5 min';
  update public.booking_meetings set starts_at = now() + interval '3 hours' where id = v.m2;
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m2, v.pin), a1) = 'ok', 'S3 retoma 2';
  assert pg_temp.try(format('select public.complete_meeting_with_skills(%L, 5, array[5], %s)', v.m2, none), a1) = 'ok', 'S3 fecha 2 (115 + 5 = 120)';
  select sum(previous_done_minutes + done_minutes) into sum_done from public.booking_meetings where booking_id = v.bk;
  assert sum_done = 240, 'S3 240/240 entregues: ' || sum_done;
  assert (select status::text from public.bookings where id = v.bk) = 'completed', 'S3 reserva concluída';
  assert (select count(*) from public.booking_meetings where booking_id = v.bk and status = 'done') = 2, 'S3 cada aula conta uma vez (2 encontros)';

  -- ===== S4: limites de duração (encontro de 120 min) =====
  select * into v from pg_temp.mk4h(120, 0);
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m1, v.pin), a1) = 'ok', 'S4 inicio';
  foreach r in array array[
    format('select public.interrupt_meeting(%L, ''Vento caiu de repente'', 110, 11, array[1], %s)', v.m1, none),   -- restante > previsto - dado (10)
    format('select public.interrupt_meeting(%L, ''Vento caiu de repente'', 120, 1, array[1], %s)', v.m1, none),    -- nada sobra: concluir normalmente
    format('select public.interrupt_meeting(%L, ''Vento caiu de repente'', 121, 1, array[1], %s)', v.m1, none),    -- mais que a aula
    format('select public.interrupt_meeting(%L, ''Vento caiu de repente'', -1, 10, array[1], %s)', v.m1, none),
    format('select public.interrupt_meeting(%L, ''Vento caiu de repente'', 110, 0, array[1], %s)', v.m1, none),
    format('select public.interrupt_meeting(%L, ''Vento caiu de repente'', 110, -5, array[1], %s)', v.m1, none),
    format('select public.complete_meeting_with_skills(%L, 121, array[1], %s)', v.m1, none),
    format('select public.complete_meeting_with_skills(%L, -1, array[1], %s)', v.m1, none)] loop
    assert pg_temp.try(r, a1) like '22023:%', 'limite deveria dar 22023: ' || r;
  end loop;
  assert (select status::text || previous_done_minutes from public.booking_meetings where id = v.m1) = 'in_progress0', 'S4 recusas não alteram o encontro';
  assert pg_temp.try(format('select public.interrupt_meeting(%L, ''Vento caiu de repente'', 110, 10, array[1], %s)', v.m1, none), a1) = 'ok', 'S4 limite exato (110 + 10 = 120) é aceito';
  t := pg_temp.free_slot(1, 25, 1);
  assert pg_temp.try(format('select public.schedule_meeting_resume(%L, %L)', v.m1, t), a1) = 'ok', 'S4 agenda';
  update public.booking_meetings set starts_at = now() + interval '5 hours' where id = v.m1;
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m1, v.pin), a1) = 'ok', 'S4 retoma';
  assert pg_temp.try(format('select public.complete_meeting_with_skills(%L, 11, array[1], %s)', v.m1, none), a1) like '22023:%', 'S4 a retomada não passa do restante (10): 11 recusado';
  assert pg_temp.try(format('select public.complete_meeting_with_skills(%L, 10, array[1], %s)', v.m1, none), a1) = 'ok', 'S4 retomada fecha com 10';

  -- ===== S5: repetições recusadas, sem efeito =====
  select * into v from pg_temp.mk4h(140, 0);
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m1, v.pin), a1) = 'ok', 'S5 inicio';
  assert pg_temp.try(format('select public.interrupt_meeting(%L, ''Vento caiu de repente'', 60, 60, array[1], %s)', v.m1, none), a1) = 'ok', 'S5 interrompe';
  select count(*) into sum_done from public.audit_logs where entity_id = v.m1::text;
  assert pg_temp.try(format('select public.interrupt_meeting(%L, ''Vento caiu de repente'', 60, 60, array[1], %s)', v.m1, none), a1) like '55000:%', 'S5 interromper duas vezes recusado';
  assert (select count(*) from public.audit_logs where entity_id = v.m1::text) = sum_done, 'S5 repetição não gera auditoria';
  assert (select interruption_count from public.booking_meetings where id = v.m1) = 1, 'S5 contagem não dobra';
  assert (select count(*) from public.app_notifications where recipient_id = stu and title = 'Aula interrompida' and href = '/aluno/atendimento/' || v.bk) = 1, 'S5 um único aviso';
  t := pg_temp.free_slot(1, 25, 1);
  assert pg_temp.try(format('select public.schedule_meeting_resume(%L, %L)', v.m1, t), a1) = 'ok', 'S5 agenda';
  assert pg_temp.try(format('select public.schedule_meeting_resume(%L, %L)', v.m1, t), a1) = 'ok', 'S5 reagendar para o MESMO horário é permitido e não duplica';
  assert (select count(*) from public.booking_meetings where booking_id = v.bk) = 2, 'S5 nenhum encontro novo';
  update public.booking_meetings set starts_at = now() + interval '7 hours' where id = v.m1;
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m1, v.pin), a1) = 'ok', 'S5 retoma';
  assert pg_temp.try(format('select public.complete_meeting_with_skills(%L, 60, array[2], %s)', v.m1, none), a1) = 'ok', 'S5 conclui';
  assert pg_temp.try(format('select public.complete_meeting_with_skills(%L, 60, array[2], %s)', v.m1, none), a1) like '55000:%', 'S5 concluir duas vezes recusado';
  assert (select count(*) from public.meeting_skill_progress where meeting_id = v.m1) = 2, 'S5 habilidades 1 e 2 sem duplicar';
  assert pg_temp.try(format('select public.schedule_meeting_resume(%L, %L)', v.m1, t), a1) like '55000:%', 'S5 agendar continuidade de encontro já concluído recusado';

  -- ===== S6: não antecipação =====
  select * into v from pg_temp.mk4h(160, 0);
  assert pg_temp.try(format('select public.interrupt_meeting(%L, ''Vento caiu de repente'', 60, 60, array[1], %s)', v.m1, none), a1) like '55000:%', 'S6 não interrompe antes de iniciar';
  assert pg_temp.try(format('select public.complete_meeting_with_skills(%L, 120, array[1], %s)', v.m1, none), a1) like '55000:%', 'S6 não conclui antes de iniciar';
  assert pg_temp.try(format('select public.schedule_meeting_resume(%L, now() + interval ''2 days'')', v.m1), a1) like '55000:%', 'S6 não agenda continuidade de encontro que nem começou';
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m1, v.pin), a1) = 'ok', 'S6 inicio';
  assert pg_temp.try(format('select public.interrupt_meeting(%L, ''Vento caiu de repente'', 60, 60, array[1], %s)', v.m1, none), a1) = 'ok', 'S6 interrompe';
  assert pg_temp.try(format('select public.schedule_meeting_resume(%L, now() - interval ''1 hour'')', v.m1), a1) like '22023:%', 'S6 continuidade no passado recusada';
  t := pg_temp.free_slot(2, ((select starts_at from public.booking_meetings where id = v.m2) at time zone 'America/Fortaleza')::date - (now() at time zone 'America/Fortaleza')::date - 1, 1);   -- dias à frente, antes do encontro 2
  assert t is not null and t > now() + interval '24 hours', 'FIXTURE: horário depois da janela de 24 h e antes do encontro 2';
  assert pg_temp.try(format('select public.schedule_meeting_resume(%L, %L)', v.m1, t), a1) = 'ok', 'S6 agenda para depois';
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m1, v.pin), a1) like '55000:%window%', 'S6 a retomada não inicia antes da janela de 24 h (agendada para dias à frente)';
  assert (select status::text from public.booking_meetings where id = v.m1) = 'scheduled', 'S6 segue agendada, sem efeito';
end $$;
rollback;
select 'PASS: VNT-1008 (4 h, 2 x 120): legado 110+115 = 225/240 com saldo 15; novo caminho conclui sem saldo; interrupção 110+10 e 115+5 fecham 240/240; limites, repetições e não antecipação' as result;
