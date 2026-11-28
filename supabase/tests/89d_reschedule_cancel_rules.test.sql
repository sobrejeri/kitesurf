-- P0 #94: reagendamento e cancelamento sem quebrar agenda, estado da reserva e saldo.
-- Banco descartável, tudo revertido no ROLLBACK. Pagamento é o simulado do banco de teste (nunca dinheiro real).
--  S1 alteração permitida: o encontro muda de horário, a reserva e as horas não mudam, o horário antigo volta a ficar livre
--  S2 horário em conflito já na solicitação (instrutor ocupado)
--  S3 horário que ficou ocupado ENTRE a solicitação e a resposta: o aceite falha sem mexer em nada; recusar abre a escolha do aluno
--  S4 horário que bate com outro encontro DO PRÓPRIO aluno (outra praia/instrutor): deve ser barrado com mensagem clara, nunca erro cru
--  S5 cancelamento: reserva e encontros cancelados, agenda liberada, não repete, só o dono, reserva com aula feita exige admin
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
create function pg_temp.as_user(who uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', who::text, true); execute 'set local role authenticated'; end $$;

create function pg_temp.slot_after(p_after timestamptz, p_need_t4 boolean) returns timestamptz language sql as $$
  select c.st from (
    select (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => d, hours => h)) at time zone 'America/Fortaleza' st
    from generate_series(0, 150) d cross join generate_series(8, 10) h) c
  where c.st >= p_after
    and public.instructor_can_attend('00000000-0000-0000-0000-0000000000a1', jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', 2)))
    and (not p_need_t4 or (public.instructor_can_attend('00000000-0000-0000-0000-0000000000a1', jsonb_build_array(jsonb_build_object('starts_at', c.st + interval '4 hours', 'hours', 2)))
                       and public.instructor_can_attend('00000000-0000-0000-0000-0000000000a2', jsonb_build_array(jsonb_build_object('starts_at', c.st + interval '4 hours', 'hours', 2)))))
    and not exists (select 1 from public.booking_meetings m join public.bookings k on k.id = m.booking_id
        where k.student_id in ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1') and m.status::text <> 'cancelled' and k.status::text in ('confirmed', 'awaiting_payment')
          and tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.minutes), '[)') && tstzrange(c.st - interval '3 hours', c.st + interval '9 hours', '[)'))
  order by c.st limit 1
$$;

do $$
declare
  a1 constant uuid := '00000000-0000-0000-0000-0000000000a1';
  a2 constant uuid := '00000000-0000-0000-0000-0000000000a2';
  stu constant uuid := '00000000-0000-0000-0000-0000000000b2';
  oth constant uuid := '00000000-0000-0000-0000-0000000000b1';
  v_jeri uuid; v_prea uuid; d1 timestamptz; t1 timestamptz; t2 timestamptz; t3 timestamptz; t4 timestamptz; d2 timestamptz;
  v_bk uuid; m1 uuid; m2 uuid; v_other uuid; v_req uuid; r text; v_bal int; v_bk2 uuid; m_p uuid; v_req2 uuid;
begin
  select id into strict v_jeri from public.beaches where slug = 'jeri';
  select id into strict v_prea from public.beaches where slug = 'prea';

  -- Cada horario e o proximo livre depois do anterior (sem exigir dias consecutivos: a agenda do instrutor de fixture pode estar cheia).
  -- d1 < t1 < t2 < t3 < d2; t1 tambem precisa deixar t1+4h livre para a1 e a2 (conflito do aluno em S4).
  d1 := pg_temp.slot_after(now() + interval '6 days', false);
  t1 := pg_temp.slot_after(d1 + interval '1 day', true);
  t2 := pg_temp.slot_after(t1 + interval '1 day', false);
  t3 := pg_temp.slot_after(t2 + interval '1 day', false);
  d2 := pg_temp.slot_after(t3 + interval '1 day', false);
  if d1 is null or t1 is null or t2 is null or t3 is null or d2 is null then raise exception 'FIXTURE: sem horarios livres suficientes'; end if;
  t4 := t1 + interval '4 hours';

  perform pg_temp.as_user(stu);
  v_bk := public.create_booking(v_jeri, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', d1, 'hours', 2), jsonb_build_object('starts_at', d2, 'hours', 2)));
  perform public.simulate_test_payment(v_bk, 'pix', 'approved');
  execute 'reset role';
  assert (select status::text from public.bookings where id = v_bk) = 'confirmed', 'fixture: reserva confirmada';
  select id into m1 from public.booking_meetings where booking_id = v_bk and position = 1;
  select id into m2 from public.booking_meetings where booking_id = v_bk and position = 2;
  assert (select instructor_id from public.bookings where id = v_bk) = a1, 'fixture: instrutor a1';

  -- ---------- S1: alteracao permitida ----------
  r := pg_temp.try(format('select public.request_meeting_change(%L, %L, ''Previsao de vento fraco, preciso remarcar'')', m1, t1), stu);
  assert r = 'ok', 'S1: solicitacao valida falhou: ' || r;
  select id into strict v_req from public.meeting_change_requests where meeting_id = m1 and status = 'pending';
  r := pg_temp.try(format('select public.respond_meeting_change(%L, true)', v_req), a1);
  assert r = 'ok', 'S1: aceite pelo instrutor falhou: ' || r;
  assert (select starts_at from public.booking_meetings where id = m1) = t1, 'S1: encontro deveria estar em t1';
  assert (select minutes from public.booking_meetings where id = m1) = 120, 'S1: duracao preservada';
  assert (select status::text from public.bookings where id = v_bk) = 'confirmed' and (select total_hours from public.bookings where id = v_bk) = 4, 'S1: reserva e horas intactas';
  assert (select count(*) from public.booking_meetings where booking_id = v_bk) = 2, 'S1: continua com 2 encontros';
  assert public.instructor_can_attend(a1, jsonb_build_array(jsonb_build_object('starts_at', d1, 'hours', 2))), 'S1: o horario antigo deve voltar a ficar livre';
  assert not public.instructor_can_attend(a1, jsonb_build_array(jsonb_build_object('starts_at', t1, 'hours', 2))), 'S1: o horario novo deve estar ocupado';
  perform pg_temp.as_user(stu); v_bal := public.booking_balance_minutes(v_bk); execute 'reset role';
  assert v_bal = 0, 'S1: remarcar nao cria nem consome saldo (tudo agendado), obteve ' || v_bal;

  -- ---------- S2: instrutor ocupado na solicitacao ----------
  perform pg_temp.as_user(oth);
  v_other := public.create_booking(v_jeri, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', t2, 'hours', 2)));
  execute 'reset role';
  assert (select instructor_id from public.bookings where id = v_other) = a1, 'S2 fixture: o outro aluno ocupa o instrutor em t2';
  r := pg_temp.try(format('select public.request_meeting_change(%L, %L, ''Quero ir para o dia seguinte'')', m1, t2), stu);
  assert r like '55000:%navailable%', 'S2: horario com instrutor ocupado deveria ser recusado na solicitacao: ' || r;
  assert not exists (select 1 from public.meeting_change_requests where meeting_id = m1 and status = 'pending'), 'S2: nao pode persistir solicitacao invalida';

  -- ---------- S3: horario ocupado entre a solicitacao e a resposta ----------
  r := pg_temp.try(format('select public.request_meeting_change(%L, %L, ''Preciso mudar para o fim da semana'')', m1, t3), stu);
  assert r = 'ok', 'S3: solicitacao para horario livre deveria passar: ' || r;
  select id into strict v_req from public.meeting_change_requests where meeting_id = m1 and status = 'pending';
  perform pg_temp.as_user(oth);
  v_other := public.create_booking(v_jeri, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', t3, 'hours', 2)));
  execute 'reset role';
  r := pg_temp.try(format('select public.respond_meeting_change(%L, true)', v_req), a1);
  assert r like '55000:%no longer available%', 'S3: aceitar horario que ficou ocupado deveria falhar: ' || r;
  assert (select starts_at from public.booking_meetings where id = m1) = t1, 'S3: o encontro nao pode ter se movido';
  assert (select status from public.meeting_change_requests where id = v_req) = 'pending', 'S3: a falha nao pode alterar a solicitacao';
  r := pg_temp.try(format('select public.respond_meeting_change(%L, false)', v_req), a1);
  assert r = 'ok', 'S3: recusar deveria funcionar: ' || r;
  assert (select status from public.meeting_change_requests where id = v_req) = 'rejected' and (select choice_expires_at from public.meeting_change_requests where id = v_req) > now() + interval '11 hours', 'S3: recusa abre a janela de escolha de 12h';
  assert (select starts_at from public.booking_meetings where id = m1) = t1 and (select status::text from public.bookings where id = v_bk) = 'confirmed', 'S3: recusa mantem encontro e reserva';

  -- ---------- S4: bate com outro encontro DO PROPRIO aluno ----------
  -- (o pedido anterior ja foi respondido; cria-se o outro encontro do aluno na praia de a2 em t4)
  perform pg_temp.as_user(stu);
  v_bk2 := public.create_booking(v_prea, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', t4 + interval '2 days', 'hours', 2)));
  execute 'reset role';
  -- leva o encontro 2 dessa reserva para t4 sem passar pelas regras (fixture): simula um aluno que ja tem aula nesse horario
  update public.booking_meetings set starts_at = t4 where booking_id = v_bk2;
  update public.bookings set instructor_id = a2 where id = v_bk2 and instructor_id is distinct from a2;   -- o outro encontro e de OUTRO instrutor
  assert (select instructor_id from public.bookings where id = v_bk2) = a2, 'S4 fixture: a2 deve ser o instrutor do outro encontro';
  -- o aluno tem uma solicitacao rejeitada em aberto na primeira reserva; limpa para poder pedir outra mudanca
  update public.meeting_change_requests set choice_expires_at = now() - interval '1 minute' where id = v_req;
  r := pg_temp.try(format('select public.request_meeting_change(%L, %L, ''Quero mudar para a tarde'')', m1, t4), stu);
  assert r like '55000:%', 'S4: horario que bate com outro encontro do proprio aluno deveria ser barrado com 55000 claro, obteve: ' || r;
  assert not exists (select 1 from public.meeting_change_requests where meeting_id = m1 and status = 'pending'), 'S4: nao pode persistir solicitacao que bate com outro encontro do aluno';
  -- Mesmo que a solicitacao entrasse (ex.: criada antes do outro encontro), aceitar nao pode dar erro cru nem mover o encontro.
  insert into public.meeting_change_requests(booking_id, meeting_id, requester_id, responder_id, original_starts_at, proposed_starts_at, reason, expires_at)
    values (v_bk, m1, stu, a1, t1, t4, 'Pedido feito antes do outro encontro', now() + interval '6 hours') returning id into v_req2;
  r := pg_temp.try(format('select public.respond_meeting_change(%L, true)', v_req2), a1);
  assert r like '55000:%', 'S4: aceite que bateria com outro encontro do aluno deveria dar 55000 claro, obteve: ' || r;
  assert (select starts_at from public.booking_meetings where id = m1) = t1, 'S4: o encontro nao pode se mover para cima de outro do aluno';
  delete from public.meeting_change_requests where id = v_req2;

  -- ---------- S5: cancelamento ----------
  -- Reserva com aula ja realizada so o admin cancela.
  select id into m_p from public.booking_meetings where booking_id = v_bk2 limit 1;
  update public.booking_meetings set status = 'done', done_minutes = 60, recorded_at = now() where id = m_p;
  update public.bookings set status = 'confirmed' where id = v_bk2 and status::text <> 'confirmed';
  -- v_req esta na reserva 1 (sem aula feita) e com a janela vencida por S4; reabre a janela para testar o cancelamento
  update public.meeting_change_requests set choice_expires_at = now() + interval '6 hours', resolution = null where id = v_req;
  r := pg_temp.try(format('select public.resolve_student_change(%L, ''cancel'')', v_req), oth);
  assert r like '42501:%', 'S5: outro aluno nao pode resolver a escolha: ' || r;
  r := pg_temp.try(format('select public.resolve_student_change(%L, ''cancel'')', v_req), stu);
  assert r = 'ok', 'S5: cancelamento pelo dono deveria funcionar: ' || r;
  assert (select status::text from public.bookings where id = v_bk) = 'cancelled' and (select cancelled_at from public.bookings where id = v_bk) is not null, 'S5: reserva cancelada';
  assert (select count(*) from public.booking_meetings where booking_id = v_bk and status::text <> 'cancelled') = 0, 'S5: todos os encontros agendados cancelados';
  assert (select count(*) from public.audit_logs where entity_id = v_bk::text and action = 'booking.student_cancelled') = 1, 'S5: auditoria do cancelamento';
  assert public.instructor_can_attend(a1, jsonb_build_array(jsonb_build_object('starts_at', t1, 'hours', 2), jsonb_build_object('starts_at', d2, 'hours', 2))), 'S5: agenda do instrutor liberada';
  r := pg_temp.try(format('select public.resolve_student_change(%L, ''cancel'')', v_req), stu);
  assert r like '55000:%', 'S5: cancelar de novo deve ser recusado: ' || r;
  assert (select count(*) from public.audit_logs where entity_id = v_bk::text and action = 'booking.student_cancelled') = 1, 'S5: cancelar de novo nao duplica auditoria';
  -- Reserva cancelada nao aceita pedido de reposicao de saldo nem nova mudanca.
  r := pg_temp.try(format('select public.request_balance_meeting(%L, %L, 60)', v_bk, d2 + interval '10 days'), stu);
  assert r <> 'ok', 'S5: reserva cancelada nao pode receber pedido de reposicao';
  r := pg_temp.try(format('select public.request_meeting_change(%L, %L, ''Tentando mudar reserva cancelada'')', m2, d2 + interval '1 day'), stu);
  assert r <> 'ok', 'S5: reserva cancelada nao pode ser remarcada';
  -- Reserva com aula feita: cancelamento do aluno exige admin.
  insert into public.meeting_change_requests(booking_id, meeting_id, requester_id, responder_id, original_starts_at, proposed_starts_at, reason, expires_at, status, choice_expires_at, responded_at)
    select v_bk2, m_p, stu, a2, starts_at, starts_at + interval '1 day', 'Solicitacao rejeitada do teste', now() - interval '1 hour', 'rejected', now() + interval '6 hours', now() from public.booking_meetings where id = m_p
    returning id into v_req2;
  r := pg_temp.try(format('select public.resolve_student_change(%L, ''cancel'')', v_req2), stu);
  assert r like '55000:%', 'S5: reserva parcialmente realizada nao pode ser cancelada pelo aluno: ' || r;
  assert (select status::text from public.bookings where id = v_bk2) <> 'cancelled', 'S5: reserva com aula feita segue de pe';
end $$;
rollback;
select 'PASS: reagendamento e cancelamento: alteracao valida, conflitos de instrutor e do aluno, recusa, cancelamento e agenda/saldo consistentes' as result;
