-- #94: janelas de 12h + 12h pelo JOB OFFLINE, substituição preservando a reserva, e ocorrência. Banco descartável, tudo revertido no ROLLBACK.
--  H1  pedido de remarcação do aluno sem resposta: expira em 12h (job), abre a janela de escolha de 12h; sem escolha, o job inicia a
--      busca de substituto; o substituto aceita e a MESMA reserva (código, valores, encontro) passa para ele
--  H3  ocorrência: o aluno relata; a outra parte é notificada; o Admin enxerga e revisa; reserva, preço e saldo NÃO mudam
-- (a janela de 72h, o pedido recusado e o cancelamento estão em 89d e test-meeting-change-auth.sh)
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

-- proximo horario (hora cheia local 8-10h) livre para a1 E a2 (2h) e sem encontros do aluno b2 por perto
create function pg_temp.slot2(p_after timestamptz) returns timestamptz language sql as $$
  select c.st from (
    select (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => d, hours => h)) at time zone 'America/Fortaleza' st
    from generate_series(0, 200) d cross join generate_series(8, 10) h) c
  where c.st >= p_after
    and public.instructor_can_attend('00000000-0000-0000-0000-0000000000a1', jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', 2)))
    and public.instructor_can_attend('00000000-0000-0000-0000-0000000000a2', jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', 2)))
    and not exists (select 1 from public.booking_meetings m join public.bookings k on k.id = m.booking_id
        where k.student_id = '00000000-0000-0000-0000-0000000000b2' and m.status::text <> 'cancelled' and k.status::text in ('confirmed', 'awaiting_payment')
          and tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.minutes), '[)') && tstzrange(c.st - interval '3 hours', c.st + interval '5 hours', '[)'))
  order by c.st limit 1
$$;

do $$
declare
  a1 constant uuid := '00000000-0000-0000-0000-0000000000a1';
  a2 constant uuid := '00000000-0000-0000-0000-0000000000a2';
  stu constant uuid := '00000000-0000-0000-0000-0000000000b2';
  oth constant uuid := '00000000-0000-0000-0000-0000000000b1';
  adm constant uuid := '00000000-0000-0000-0000-00000000000a';
  v_prea uuid; t1 timestamptz; t2 timestamptz; v_bk uuid; m1 uuid; x uuid; y uuid; v_req uuid; v_js jsonb; r text; v_code text; v_total int; v_net int;
  v_off uuid; v_re uuid; v_inc uuid; v_bal0 int; v_bal1 int; v_n int; v_status text;
begin
  select id into strict v_prea from public.beaches where slug = 'prea';
  t1 := pg_temp.slot2(now() + interval '6 days');
  t2 := pg_temp.slot2(t1 + interval '1 day');
  assert t1 is not null and t2 is not null, 'FIXTURE: sem horarios livres para a1 e a2';

  perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
  v_bk := public.create_booking(v_prea, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', t1, 'hours', 2)));
  perform public.simulate_test_payment(v_bk, 'pix', 'approved');
  execute 'reset role';
  select instructor_id, code, total_cents, instructor_net_cents into x, v_code, v_total, v_net from public.bookings where id = v_bk;
  assert x in (a1, a2) and (select status::text from public.bookings where id = v_bk) = 'confirmed', 'fixture: reserva confirmada com a1 ou a2';
  y := case when x = a1 then a2 else a1 end;
  select id into m1 from public.booking_meetings where booking_id = v_bk;

  -- ---------------- H1: 12h sem resposta -> janela do aluno 12h -> sem escolha, busca de substituto ----------------
  r := pg_temp.try(format('select public.request_meeting_change(%L, %L, ''Preciso mudar por motivo pessoal'')', m1, t2), stu);
  assert r = 'ok', 'H1: pedido valido: ' || r;
  select id into strict v_req from public.meeting_change_requests where meeting_id = m1 and status = 'pending';
  assert (select expires_at - requested_at from public.meeting_change_requests where id = v_req) between interval '11 hours 59 minutes' and interval '12 hours 1 minute', 'H1: o prazo de resposta e de 12h';

  v_js := public.run_expiry_jobs();                                                  -- ainda dentro do prazo: nada expira
  assert (select status from public.meeting_change_requests where id = v_req) = 'pending', 'H1: antes das 12h o pedido segue pendente';
  update public.meeting_change_requests set expires_at = now() - interval '1 second' where id = v_req;   -- as 12h passaram, ninguem respondeu
  v_js := public.run_expiry_jobs();                                                  -- o job offline expira o pedido
  assert (v_js ->> 'meeting_changes')::int >= 1, 'H1: o job deveria ter expirado o pedido: ' || v_js::text;
  assert (select status from public.meeting_change_requests where id = v_req) = 'expired', 'H1: pedido expirado';
  assert (select choice_expires_at from public.meeting_change_requests where id = v_req) between now() + interval '11 hours 59 minutes' and now() + interval '12 hours 1 minute', 'H1: abre a janela de escolha do aluno de 12h';
  assert (select instructor_id from public.bookings where id = v_bk) = x and (select starts_at from public.booking_meetings where id = m1) = t1 and (select status::text from public.bookings where id = v_bk) = 'confirmed', 'H1: expirar nao troca instrutor, nao muda o encontro e nao cancela';
  assert exists (select 1 from public.app_notifications where recipient_id = stu and title = 'Prazo de resposta encerrado'), 'H1: o aluno e avisado';
  v_js := public.run_expiry_jobs();
  assert (select instructor_id from public.bookings where id = v_bk) = x and (select resolution from public.meeting_change_requests where id = v_req) is null, 'H1: durante a janela de 12h do aluno o job nao decide por ele';

  update public.meeting_change_requests set choice_expires_at = now() - interval '1 second' where id = v_req;   -- as outras 12h passaram sem escolha
  v_js := public.run_expiry_jobs();
  assert (select resolution from public.meeting_change_requests where id = v_req) = 'replacement_requested', 'H1: sem escolha do aluno o job inicia a busca de substituto';
  assert (select status::text from public.bookings where id = v_bk) = 'confirmed' and (select instructor_id from public.bookings where id = v_bk) is null, 'H1: a reserva segue confirmada, sem instrutor durante a busca';
  assert (select status::text from public.booking_meetings where id = m1) = 'scheduled' and (select starts_at from public.booking_meetings where id = m1) = t1, 'H1: o encontro mantem data e estado';
  select o.id, r2.id into v_off, v_re from public.booking_reassignment_offers o join public.booking_reassignments r2 on r2.id = o.reassignment_id
   where r2.booking_id = v_bk and o.instructor_id = y and o.status = 'offered';
  assert v_off is not null, 'H1: o outro instrutor elegivel recebeu a oferta de substituicao';
  r := pg_temp.try(format('select public.respond_booking_reassignment(%L, true)', v_off), y);
  assert r = 'ok', 'H1: o substituto aceita: ' || r;
  assert (select instructor_id from public.bookings where id = v_bk) = y, 'H1: a reserva passou para o substituto';
  assert exists (select 1 from public.bookings where id = v_bk and code = v_code and total_cents = v_total and instructor_net_cents = v_net and status::text = 'confirmed'), 'H1: codigo e valores congelados preservados';
  assert (select count(*) from public.bookings where code = v_code) = 1 and (select count(*) from public.booking_meetings where booking_id = v_bk) = 1 and (select starts_at from public.booking_meetings where id = m1) = t1, 'H1: uma reserva, um encontro, mesma data';
  assert public.instructor_can_attend(x, jsonb_build_array(jsonb_build_object('starts_at', t1, 'hours', 2))) and not public.instructor_can_attend(y, jsonb_build_array(jsonb_build_object('starts_at', t1, 'hours', 2))), 'H1: agenda do instrutor antigo liberada e a do novo ocupada';

  -- ---------------- H3: ocorrencia ----------------
  update public.booking_meetings set starts_at = now() - interval '3 hours' where id = m1;   -- o encontro "aconteceu"; so dentro desta transacao
  perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated'; v_bal0 := public.booking_balance_minutes(v_bk); execute 'reset role';
  r := pg_temp.try(format('select public.report_lesson_incident(%L, %L, ''weather'', 30, ''Vento muito forte, aula interrompida'')', v_bk, m1), stu);
  assert r = 'ok', 'H3: o aluno relata a ocorrencia: ' || r;
  select id into strict v_inc from public.booking_incidents where booking_id = v_bk;
  assert (select status from public.booking_incidents where id = v_inc) = 'open', 'H3: nasce aberta';
  assert exists (select 1 from public.app_notifications where recipient_id = y and title = 'Imprevisto registrado'), 'H3: a outra parte (instrutor) e notificada';
  assert not exists (select 1 from public.app_notifications where recipient_id = stu and title = 'Imprevisto registrado'), 'H3: quem relatou nao se notifica';
  -- entradas invalidas
  r := pg_temp.try(format('select public.report_lesson_incident(%L, %L, ''weather'', 30, ''curto'')', v_bk, m1), stu);
  assert r like '22023:%', 'H3: descricao curta recusada: ' || r;
  r := pg_temp.try(format('select public.report_lesson_incident(%L, %L, ''weather'', 999, ''Descricao com mais de dez letras'')', v_bk, m1), stu);
  assert r like '22023:%', 'H3: minutos acima do encontro recusados: ' || r;
  r := pg_temp.try(format('select public.report_lesson_incident(%L, %L, ''weather'', 10, ''Alguem de fora tentando relatar'')', v_bk, m1), oth);
  assert r like '42501:%', 'H3: quem nao e participante nao relata: ' || r;
  -- visibilidade: o Admin ve a ocorrencia aberta (fila de analise); o aluno de fora nao
  perform set_config('request.jwt.claim.sub', adm::text, true); execute 'set local role authenticated';
  select count(*) into v_n from public.booking_incidents where id = v_inc and status = 'open'; execute 'reset role';
  assert v_n = 1, 'H3: o Admin deveria ver a ocorrencia aberta';
  perform set_config('request.jwt.claim.sub', oth::text, true); execute 'set local role authenticated';
  select count(*) into v_n from public.booking_incidents where id = v_inc; execute 'reset role';
  assert v_n = 0, 'H3: IDOR: aluno de fora leu a ocorrencia';
  -- o Admin revisa; os participantes veem o novo estado
  r := pg_temp.try(format('select public.review_lesson_incident(%L, ''reviewing'', ''Em analise pela operacao'')', v_inc), adm);
  assert r = 'ok', 'H3: Admin coloca em analise: ' || r;
  r := pg_temp.try(format('select public.review_lesson_incident(%L, ''resolved'', ''Aula remarcada sem custo extra'')', v_inc), adm);
  assert r = 'ok', 'H3: Admin resolve: ' || r;
  r := pg_temp.try(format('select public.review_lesson_incident(%L, ''resolved'', ''tentativa do aluno'')', v_inc), stu);
  assert r <> 'ok', 'H3: so Admin revisa';
  foreach x in array array[stu, y] loop
    perform set_config('request.jwt.claim.sub', x::text, true); execute 'set local role authenticated';
    select status into v_status from public.booking_incidents where id = v_inc; execute 'reset role';
    assert v_status = 'resolved', format('H3: %s deveria ver a ocorrencia resolvida, viu %s', x, v_status);
  end loop;
  assert (select count(*) from public.audit_logs where entity_id = v_inc::text and action in ('incident.reported', 'incident.reviewed')) = 3, 'H3: auditoria do relato e das duas revisoes';
  -- a ocorrencia NAO mexe em reserva, preco nem saldo
  perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated'; v_bal1 := public.booking_balance_minutes(v_bk); execute 'reset role';
  assert v_bal1 = v_bal0, 'H3: o saldo nao muda por ocorrencia';
  assert exists (select 1 from public.bookings where id = v_bk and code = v_code and total_cents = v_total and instructor_net_cents = v_net and status::text = 'confirmed') and (select status::text from public.booking_meetings where id = m1) = 'scheduled', 'H3: reserva, valores e encontro intactos (sem cobranca, estorno ou cancelamento automatico)';
end $$;
rollback;
select 'PASS: janelas 12h+12h pelo job offline, substituicao preservando a reserva e ocorrencia (relato, notificacao, Admin, saldo intacto)' as result;
