-- #93 Etapa 1/4: interrupção excepcional por aula e retomada agendada pelo instrutor (migration 20261121120000).
-- Banco descartável; tudo dentro de uma transação revertida (ROLLBACK). Contagens antes/depois provam que nada persiste.
-- Cobre: normal 45/60 sem saldo; interrompida 30/60 + retomada 30; vários encontros; colisão (instrutor, aluno, ordem);
--        instrutor errado/aluno; chamada duplicada; habilidades sem duplicar; guarda do caminho legado; reserva antiga intacta.
\set ON_ERROR_STOP on
select count(*) as n_bookings from public.bookings \gset before_
select count(*) as n_meetings from public.booking_meetings \gset before_
select count(*) as n_audit from public.audit_logs \gset before_
select count(*) as n_notif from public.app_notifications \gset before_
select count(*) as n_skills from public.meeting_skill_progress \gset before_
select count(*) as n_interrupted from public.booking_meetings where interruption_count > 0 \gset before_
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

-- Hora cheia local (8-10h) livre para a1 (1h) e sem encontros do aluno por perto, entre dois dias relativos.
create function pg_temp.free_slot(p_from int, p_to int) returns timestamptz language sql as $$
  select c.st from (
    select (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => d, hours => h)) at time zone 'America/Fortaleza' st
    from generate_series(p_from, p_to) d cross join generate_series(8, 10) h) c
  where c.st > now() + interval '2 hours'
    and public.instructor_can_attend('00000000-0000-0000-0000-0000000000a1', jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', 1)))
    and not exists (select 1 from public.booking_meetings m join public.bookings k on k.id = m.booking_id
        where k.student_id = '00000000-0000-0000-0000-0000000000b2' and m.status::text <> 'cancelled' and k.status::text in ('confirmed', 'awaiting_payment')
          and tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.minutes), '[)') && tstzrange(c.st - interval '3 hours', c.st + interval '3 hours', '[)'))
  order by c.st limit 1
$$;

-- Reserva paga (simulada) de 2 encontros de 1h. O 1o encontro "aconteceu" ha p_hours_ago horas (cada reserva usa um horario distinto) (so nesta transacao); o 2o fica no futuro.
create function pg_temp.mkbook(p_hours_ago int, out v_bk uuid, out m1 uuid, out m2 uuid, out v_pin text, out d2 timestamptz) language plpgsql as $$
declare d1 timestamptz;
begin
  d1 := pg_temp.free_slot(3, 40);
  d2 := pg_temp.free_slot(((d1 at time zone 'America/Fortaleza')::date - (now() at time zone 'America/Fortaleza')::date) + 3, 80);
  if d1 is null or d2 is null then raise exception 'FIXTURE: sem horarios livres'; end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true); execute 'set local role authenticated';
  v_bk := public.create_booking((select id from public.beaches where slug = 'jeri'), 'first_time', 'Português',
    jsonb_build_array(jsonb_build_object('starts_at', d1, 'hours', 1), jsonb_build_object('starts_at', d2, 'hours', 1)));
  perform public.simulate_test_payment(v_bk, 'pix', 'approved');
  execute 'reset role';
  if (select instructor_id from public.bookings where id = v_bk) is distinct from '00000000-0000-0000-0000-0000000000a1'::uuid then raise exception 'FIXTURE: instrutor esperado a1'; end if;
  select id into m1 from public.booking_meetings where booking_id = v_bk and position = 1;
  select id into m2 from public.booking_meetings where booking_id = v_bk and position = 2;
  select presence_code into v_pin from public.bookings where id = v_bk;
  update public.booking_meetings set starts_at = now() - make_interval(hours => p_hours_ago) where id = m1;
end $$;

do $$
declare
  a1 constant uuid := '00000000-0000-0000-0000-0000000000a1';
  a2 constant uuid := '00000000-0000-0000-0000-0000000000a2';
  stu constant uuid := '00000000-0000-0000-0000-0000000000b2';
  oth constant uuid := '00000000-0000-0000-0000-0000000000b1';
  v record; w record; r text; x record; t1 timestamptz; t2 timestamptz; v_n int; v_bal int; v_req uuid;
begin
  assert (select count(*) from public.booking_meetings where interruption_count > 0) = 0, 'partida: nenhuma reserva existente tem interrupcao';

  -- ============ A. Aula NORMAL de 45/60: conclui sem criar saldo ============
  select * into v from pg_temp.mkbook(6);
  r := pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m1, v.v_pin), a1);
  assert r = 'ok', 'inicio do encontro 1: ' || r;
  -- Simulate a stale in-progress meeting after the reservation loses confirmation.
  -- A direct RPC must not revive a non-confirmed booking or write skills/minutes.
  update public.bookings set status = 'cancelled' where id = v.v_bk;
  r := pg_temp.try(format('select public.complete_meeting_with_skills(%L, 45, array[1], array[]::int[])', v.m1), a1);
  assert r like '55000:%Booking must be confirmed%', 'cancelled booking cannot complete: ' || r;
  assert (select status::text from public.bookings where id = v.v_bk) = 'cancelled', 'booking remains cancelled';
  assert (select status::text from public.booking_meetings where id = v.m1) = 'in_progress', 'meeting remains unchanged';
  assert not exists (select 1 from public.meeting_skill_progress where meeting_id = v.m1), 'no skills written';
  update public.bookings set status = 'confirmed' where id = v.v_bk;
  r := pg_temp.try(format('select public.complete_meeting_with_skills(%L, 45, array[1], array[]::int[])', v.m1), a1);
  assert r = 'ok', 'conclusao normal 45/60: ' || r;
  assert (select status::text || done_minutes from public.booking_meetings where id = v.m1) = 'done45' and (select interruption_state from public.booking_meetings where id = v.m1) is null, 'encontro 1 concluido com 45, sem estado de interrupcao';
  assert (select status::text from public.bookings where id = v.v_bk) = 'confirmed', 'ainda ha o encontro 2: reserva segue confirmada';
  -- duplicado: recusado, nada muda
  r := pg_temp.try(format('select public.complete_meeting_with_skills(%L, 45, array[1], array[]::int[])', v.m1), a1);
  assert r like '55000:%', 'conclusao duplicada deve ser recusada: ' || r;
  assert (select count(*) from public.meeting_skill_progress where meeting_id = v.m1) = 1, 'habilidade nao duplica';
  -- encontro 2 normal de 60: a reserva conclui; 45+60 < 120 de contrato, mas NAO vira saldo
  update public.booking_meetings set starts_at = now() - interval '1 hour' where id = v.m2;
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m2, v.v_pin), a1) = 'ok', 'inicio do encontro 2';
  assert pg_temp.try(format('select public.complete_meeting_with_skills(%L, 60, array[]::int[], array[2])', v.m2), a1) = 'ok', 'conclusao do encontro 2';
  assert (select status::text from public.bookings where id = v.v_bk) = 'completed', 'reserva concluida sem exigir a soma dos minutos (sem saldo artificial)';
  r := pg_temp.try(format('select public.request_balance_meeting(%L, now() + interval ''5 days'', 15)', v.v_bk), stu);
  assert r <> 'ok', 'reserva concluida nao aceita pedido de reposicao: ' || r;

  -- ============ B. Aula INTERROMPIDA 30/60 + retomada 30, em reserva de varios encontros ============
  select * into v from pg_temp.mkbook(10);
  select count(*) into v_n from public.audit_logs;
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m1, v.v_pin), a1) = 'ok', 'inicio do encontro 1';
  -- Entradas invalidas: nada muda e o encontro segue em andamento.
  foreach r in array array[
    format('select public.interrupt_meeting(%L, ''curto'', 30, 30, array[1], array[]::int[])', v.m1),                    -- motivo curto
    format('select public.interrupt_meeting(%L, ''Vento forte demais'', 30, 0, array[1], array[]::int[])', v.m1),       -- restante 0
    format('select public.interrupt_meeting(%L, ''Vento forte demais'', 30, 31, array[1], array[]::int[])', v.m1),      -- restante > previsto - dado
    format('select public.interrupt_meeting(%L, ''Vento forte demais'', 61, 1, array[1], array[]::int[])', v.m1),       -- ministrou mais que a aula
    format('select public.interrupt_meeting(%L, ''Vento forte demais'', 30, 30, array[]::int[], array[]::int[])', v.m1),-- minutos sem habilidade
    format('select public.interrupt_meeting(%L, ''Vento forte demais'', 30, 30, array[1,1], array[]::int[])', v.m1),    -- habilidade repetida
    format('select public.interrupt_meeting(%L, ''Vento forte demais'', 30, NULL, array[1], array[]::int[])', v.m1)] loop
    assert pg_temp.try(r, a1) like '22023:%', 'entrada invalida deveria dar 22023: ' || r;
  end loop;
  assert (select status::text from public.booking_meetings where id = v.m1) = 'in_progress' and (select interruption_count from public.booking_meetings where id = v.m1) = 0, 'entradas invalidas nao alteram o encontro';
  -- Autorizacao: outro instrutor e o aluno.
  assert pg_temp.try(format('select public.interrupt_meeting(%L, ''Vento forte demais'', 30, 30, array[1], array[]::int[])', v.m1), a2) like 'P0002:%', 'outro instrutor nao interrompe';
  assert pg_temp.try(format('select public.interrupt_meeting(%L, ''Vento forte demais'', 30, 30, array[1], array[]::int[])', v.m1), stu) like '42501:%', 'aluno nao interrompe';
  assert pg_temp.try(format('select public.interrupt_meeting(%L, ''Vento forte demais'', 30, 30, array[1], array[]::int[])', gen_random_uuid()), a1) like 'P0002:%', 'encontro inexistente';
  -- Interrupcao valida: 30 ministrados, 30 restantes, habilidades 1 e 2 praticadas.
  r := pg_temp.try(format('select public.interrupt_meeting(%L, ''Vento forte demais para voar'', 30, 30, array[1,2], array[]::int[])', v.m1), a1);
  assert r = 'ok', 'interrupcao valida: ' || r;
  select * into x from public.booking_meetings where id = v.m1;
  assert x.status::text = 'scheduled' and x.interruption_state = 'awaiting_resume' and x.previous_done_minutes = 30 and x.remaining_minutes = 30
     and x.planned_minutes = 60 and x.done_minutes = 0 and x.interruption_count = 1 and x.interruption_reason = 'Vento forte demais para voar', 'estado apos interromper: ' || row(x.status, x.interruption_state, x.previous_done_minutes, x.remaining_minutes, x.done_minutes)::text;
  assert (select status::text from public.bookings where id = v.v_bk) = 'confirmed', 'reserva segue confirmada (nao conclui, nao cria saldo)';
  assert (select count(*) from public.meeting_skill_progress where meeting_id = v.m1) = 2, 'duas habilidades gravadas uma vez';
  assert (select count(*) from public.app_notifications where recipient_id = stu and title = 'Aula interrompida' and body like '%pelo chat%' and href = '/aluno/atendimento/' || v.v_bk) = 1, 'aluno avisado com link ao chat da reserva';
  assert (select count(*) from public.audit_logs where action = 'meeting.interrupted' and entity_id = v.m1::text) = 1, 'auditoria da interrupcao';
  -- Chamada duplicada: recusada, sem segundo aviso nem segunda contagem.
  r := pg_temp.try(format('select public.interrupt_meeting(%L, ''Vento forte demais para voar'', 30, 30, array[1,2], array[]::int[])', v.m1), a1);
  assert r like '55000:%', 'interrupcao duplicada deve ser recusada: ' || r;
  assert (select count(*) from public.app_notifications where recipient_id = stu and title = 'Aula interrompida' and href = '/aluno/atendimento/' || v.v_bk) = 1, 'sem segundo aviso';
  assert (select interruption_count from public.booking_meetings where id = v.m1) = 1, 'contagem nao dobra';
  -- Sem agendar a continuidade, nao inicia; a RPC legada deve estar revogada e o encontro 2 nao pula a fila.
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m1, v.v_pin), a1) like '55000:%continuation%', 'nao inicia sem agendar a continuidade';
  assert pg_temp.try(format('select public.start_meeting(%L, %L)', v.m1, v.v_pin), a1) like '42501:%', 'RPC legada deve estar revogada para authenticated';
  update public.booking_meetings set starts_at = now() + interval '5 hours' where id = v.m2;   -- (tempo de teste) abre a janela de 24h do encontro 2
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m2, v.v_pin), a1) like '55000:%previous%', 'encontro 2 espera o 1';
  update public.booking_meetings set starts_at = v.d2 where id = v.m2;
  -- Concluir ou registrar pelo legado um encontro que nao esta em andamento tambem falha.
  assert pg_temp.try(format('select public.complete_meeting_with_skills(%L, 30, array[3], array[]::int[])', v.m1), a1) like '55000:%', 'nao conclui sem estar em andamento';

  -- Agendar a continuidade: autorizacao, data e colisoes.
  t1 := pg_temp.free_slot(1, ((v.d2 at time zone 'America/Fortaleza')::date - (now() at time zone 'America/Fortaleza')::date) - 1);
  assert t1 is not null and t1 + interval '30 minutes' <= v.d2, 'FIXTURE: horario livre antes do encontro 2';
  assert pg_temp.try(format('select public.schedule_meeting_resume(%L, %L)', v.m1, t1), a2) like 'P0002:%', 'outro instrutor nao agenda';
  assert pg_temp.try(format('select public.schedule_meeting_resume(%L, %L)', v.m1, t1), stu) like '42501:%', 'aluno nao agenda';
  assert pg_temp.try(format('select public.schedule_meeting_resume(%L, now() - interval ''1 hour'')', v.m1), a1) like '22023:%', 'data passada recusada';
  assert pg_temp.try(format('select public.schedule_meeting_resume(%L, NULL)', v.m1), a1) like '22023:%', 'data nula recusada';
  assert pg_temp.try(format('select public.schedule_meeting_resume(%L, now() + interval ''91 days'')', v.m1), a1) like '22023:%', 'alem de 90 dias recusada';
  -- ordem: depois do inicio do encontro 2 muda a ordem da reserva
  assert pg_temp.try(format('select public.schedule_meeting_resume(%L, %L)', v.m1, v.d2 + interval '1 hour'), a1) like '55000:%order%', 'continuidade apos o encontro 2 quebra a ordem';
  -- colisao do instrutor: folga cobrindo o horario
  insert into public.instructor_time_off(instructor_id, starts_at, ends_at, reason) values (a1, t1 - interval '1 hour', t1 + interval '2 hours', 'teste 89l');
  assert pg_temp.try(format('select public.schedule_meeting_resume(%L, %L)', v.m1, t1), a1) like '55000:%Instructor unavailable%', 'folga do instrutor bloqueia';
  delete from public.instructor_time_off where reason = 'teste 89l';
  -- colisao do ALUNO com outra reserva dele em outro instrutor (a2): o instrutor da continuidade (a1) esta livre
  select * into w from pg_temp.mkbook(14);
  update public.booking_meetings set starts_at = t1 where id = w.m2;
  update public.bookings set instructor_id = a2 where id = w.v_bk;
  assert pg_temp.try(format('select public.schedule_meeting_resume(%L, %L)', v.m1, t1), a1) like '55000:%Student already has a meeting%', 'conflito do aluno com outra reserva bloqueia';
  update public.booking_meetings set status = 'cancelled' where id = w.m2;
  -- agenda valida
  r := pg_temp.try(format('select public.schedule_meeting_resume(%L, %L)', v.m1, t1), a1);
  assert r = 'ok', 'agendar a continuidade: ' || r;
  select * into x from public.booking_meetings where id = v.m1;
  assert x.interruption_state = 'resume_scheduled' and x.starts_at = t1 and x.minutes = 30 and x.status::text = 'scheduled' and x.previous_done_minutes = 30 and x.planned_minutes = 60, 'continuidade agendada no MESMO encontro';
  assert (select count(*) from public.booking_meetings where booking_id = v.v_bk) = 2, 'nao cria encontro novo';
  assert (select count(*) from public.app_notifications where recipient_id = stu and title = 'Continuidade da aula agendada') = 1, 'aluno avisado da continuidade';
  -- reagendar enquanto nao comecou
  t2 := pg_temp.free_slot(((t1 at time zone 'America/Fortaleza')::date - (now() at time zone 'America/Fortaleza')::date) + 1, ((v.d2 at time zone 'America/Fortaleza')::date - (now() at time zone 'America/Fortaleza')::date) - 1);
  if t2 is not null then
    assert pg_temp.try(format('select public.schedule_meeting_resume(%L, %L)', v.m1, t2), a1) = 'ok', 'reagendar a continuidade';
    assert (select starts_at from public.booking_meetings where id = v.m1) = t2, 'novo horario gravado';
  end if;

  -- Retomada: inicia com o PIN, e conclui somando os minutos. Concluir pelo caminho LEGADO e recusado (perderia os 30 iniciais).
  update public.booking_meetings set starts_at = now() + interval '1 hour' where id = v.m1;   -- (tempo de teste) abre a janela de 24h
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m1, case when v.v_pin = '0000' then '1111' else '0000' end), a1) like '22023:%', 'PIN errado na retomada';
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m1, v.v_pin), a1) = 'ok', 'retomada inicia com PIN';
  r := pg_temp.try(format('select public.record_meeting_with_skills(%L, 30, array[3], array[]::int[])', v.m1), a1);
  assert r like '55000:%complete_meeting_with_skills%', 'caminho legado nao conclui uma retomada: ' || r;
  r := pg_temp.try(format('select public.complete_meeting_with_skills(%L, 31, array[3], array[]::int[])', v.m1), a1);
  assert r like '22023:%', 'a continuidade nao passa do restante (30): ' || r;
  r := pg_temp.try(format('select public.complete_meeting_with_skills(%L, 30, array[3], array[1])', v.m1), a1);
  assert r = 'ok', 'concluir a retomada: ' || r;
  select * into x from public.booking_meetings where id = v.m1;
  assert x.status::text = 'done' and x.done_minutes = 30 and x.previous_done_minutes = 30 and x.interruption_state = 'resumed', 'retomada concluida: total 30 + 30';
  assert (select count(*) from public.meeting_skill_progress where meeting_id = v.m1) = 3, 'habilidades sem duplicar (1,2,3)';
  assert (select result from public.meeting_skill_progress where meeting_id = v.m1 and step_number = 1) = 'mastered', 'a habilidade 1 subiu de praticada para dominada';
  assert (select result from public.meeting_skill_progress where meeting_id = v.m1 and step_number = 2) = 'practiced', 'a habilidade 2 segue praticada';
  assert (select status::text from public.bookings where id = v.v_bk) = 'confirmed', 'ainda ha o encontro 2: reserva confirmada';
  assert pg_temp.try(format('select public.complete_meeting_with_skills(%L, 30, array[3], array[]::int[])', v.m1), a1) like '55000:%', 'conclusao duplicada da retomada recusada';

  -- Encontro 2: tambem interrompido uma vez e retomado (segunda interrupcao na mesma reserva); a reserva so conclui no fim.
  update public.booking_meetings set starts_at = now() + interval '3 hours' where id = v.m2;
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m2, v.v_pin), a1) = 'ok', 'inicio do encontro 2';
  assert pg_temp.try(format('select public.interrupt_meeting(%L, ''Chuva forte no pico'', 20, 40, array[4], array[]::int[])', v.m2), a1) = 'ok', 'encontro 2 interrompido (20 + 40)';
  assert (select status::text from public.bookings where id = v.v_bk) = 'confirmed', 'interrompido pendente impede a conclusao da reserva';
  t1 := pg_temp.free_slot(1, 60);
  assert pg_temp.try(format('select public.schedule_meeting_resume(%L, %L)', v.m2, t1), a1) = 'ok', 'continuidade do encontro 2';
  update public.booking_meetings set starts_at = now() + interval '3 hours' where id = v.m2;
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m2, v.v_pin), a1) = 'ok', 'retomada do encontro 2';
  assert pg_temp.try(format('select public.complete_meeting_with_skills(%L, 40, array[4,5], array[]::int[])', v.m2), a1) = 'ok', 'concluir encontro 2 (40)';
  assert (select count(*) from public.meeting_skill_progress where meeting_id = v.m2) = 2, 'encontro 2: habilidades 4 e 5, sem duplicar';
  assert (select status::text from public.bookings where id = v.v_bk) = 'completed', 'ambos concluidos (cada aula conta uma vez): reserva concluida';
  assert (select count(*) from public.booking_meetings where booking_id = v.v_bk and status = 'done') = 2, 'a aula interrompida nao duplica na evolucao: 2 encontros concluidos';
  assert (select sum(previous_done_minutes + done_minutes) from public.booking_meetings where booking_id = v.v_bk) = 120, 'minutos totais ministrados = 30+30 e 20+40';
  -- Valores financeiros congelados: nada de dinheiro mudou.
  assert (select total_cents = partner_cents + platform_cents + instructor_net_cents from public.bookings where id = v.v_bk), 'divisao financeira intacta';

  -- ============ C. Reserva ANTIGA (sem interrupcao) segue pelos caminhos legados ============
  select * into v from pg_temp.mkbook(18);
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m1, v.v_pin), a1) = 'ok', 'legado: inicio';
  assert pg_temp.try(format('select public.record_meeting_with_skills(%L, 60, array[1], array[]::int[])', v.m1), a1) = 'ok', 'legado: record_meeting_with_skills continua funcionando';
  assert (select interruption_count from public.booking_meetings where id = v.m1) = 0, 'legado nao ganha estado de interrupcao';

  -- ============ D. Permissoes das funcoes novas ============
  assert not has_function_privilege('anon', 'public.interrupt_meeting(uuid,text,integer,integer,integer[],integer[])', 'EXECUTE')
     and not has_function_privilege('anon', 'public.schedule_meeting_resume(uuid,timestamptz)', 'EXECUTE')
     and not has_function_privilege('anon', 'public.complete_meeting_with_skills(uuid,integer,integer[],integer[])', 'EXECUTE'), 'anon nao executa';
  assert has_function_privilege('authenticated', 'public.interrupt_meeting(uuid,text,integer,integer,integer[],integer[])', 'EXECUTE'), 'authenticated executa (papel conferido dentro)';
  assert not has_function_privilege('authenticated', 'public.save_meeting_steps(uuid,integer[],integer[])', 'EXECUTE')
     and not has_function_privilege('authenticated', 'public.assert_valid_meeting_steps(integer,integer[],integer[])', 'EXECUTE')
     and not has_function_privilege('authenticated', 'public.guard_interrupted_meeting_completion()', 'EXECUTE'), 'internos fechados a API';
  assert not has_function_privilege('anon', 'public.start_meeting(uuid,text)', 'EXECUTE') and not has_function_privilege('anon', 'public.start_ordered_meeting(uuid,text)', 'EXECUTE'), 'start_* seguem fechadas ao anon';
end $$;
rollback;

-- Evidencia de ROLLBACK: as contagens voltaram exatamente ao valor de antes.
select (select count(*) from public.bookings) = :before_n_bookings as b,
       (select count(*) from public.booking_meetings) = :before_n_meetings as m,
       (select count(*) from public.audit_logs) = :before_n_audit as a,
       (select count(*) from public.app_notifications) = :before_n_notif as n,
       (select count(*) from public.meeting_skill_progress) = :before_n_skills as s,
       (select count(*) from public.booking_meetings where interruption_count > 0) = :before_n_interrupted as i \gset ok_
select :before_n_bookings as bookings_antes, (select count(*) from public.bookings) as bookings_depois, :before_n_meetings as encontros_antes, (select count(*) from public.booking_meetings) as encontros_depois, :before_n_audit as auditoria_antes, (select count(*) from public.audit_logs) as auditoria_depois, :before_n_notif as avisos_antes, (select count(*) from public.app_notifications) as avisos_depois, :before_n_skills as habilidades_antes, (select count(*) from public.meeting_skill_progress) as habilidades_depois, :before_n_interrupted as interrompidos_antes, (select count(*) from public.booking_meetings where interruption_count > 0) as interrompidos_depois;
select 1 / (case when :'ok_b'::boolean and :'ok_m'::boolean and :'ok_a'::boolean and :'ok_n'::boolean and :'ok_s'::boolean and :'ok_i'::boolean then 1 else 0 end) as rollback_ok;
select 'PASS: interrupcao e retomada por aula (45/60 sem saldo; 30/60 + 30; multiplos encontros; colisoes; IDOR; duplicados; legado) e ROLLBACK comprovado' as result;
