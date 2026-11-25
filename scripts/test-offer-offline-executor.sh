#!/usr/bin/env bash
# #92: ensaio do EXECUTOR OFFLINE da fila em PostgreSQL descartável (3 instrutores fictícios elegíveis).
# O executor é o JOB do banco (run_queue_expiry_job / run_expiry_jobs, migration 20261119140000), com privilégio de serviço e SEM nenhuma
# sessão de aluno ou instrutor; é o que o agendador de homologação chamaria. Aqui o tempo "passa" movendo expires_at para o passado; nada além do executor age nas etapas 1 e 2.
#  1. A -> B -> C avançam sozinhos por expiração; ninguém é oferecido duas vezes; sem reserva; o pedido só expira ao fim da janela
#  2. A expira (executor), B recusa, C aceita: uma única reserva; reexecutar o executor é idempotente
#  3. o MESMO estado é visto por Aluno (pedido), Instrutor (oferta) e Admin (tudo); quem perdeu não vê a reserva
#  4. a RPC do executor NÃO é executável por anon nem authenticated
# Depende dos três instrutores de teste: a1, a2 e o instrutor C criado por scripts/test-offer-queue-abc.sh (roda depois dele).
# NÃO prova o agendador real (Render/cron): isso exige o ambiente de homologação (docs/HOMOLOGACAO_FILA_92.md).
set -euo pipefail
: "${PG_TEST_SOCKET:?Disposable database socket required}"
: "${PG_TEST_PORT:?Disposable database port required}"
psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare
  stu constant uuid := '00000000-0000-0000-0000-0000000000b1';
  adm constant uuid := '00000000-0000-0000-0000-00000000000a';
  a1 constant uuid := '00000000-0000-0000-0000-0000000000a1';
  a2 constant uuid := '00000000-0000-0000-0000-0000000000a2';
  c3 constant uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
  v_prea uuid; v_s timestamptz; v_req uuid; v_offer uuid; v_inst uuid; v_seen uuid[] := '{}'; i int; v_bk uuid; v_before bigint; v_t0 timestamptz := now();
  v_ofa uuid; v_ofb uuid; v_ofc uuid; v_a uuid; v_b uuid; v_c uuid; v_n int; v_status text; v_o text; v_js jsonb;
begin
  assert exists (select 1 from public.instructors where id = c3 and status = 'approved'), 'FIXTURE: o instrutor C (de test-offer-queue-abc.sh) precisa existir';
  select id into strict v_prea from public.beaches where slug = 'prea';
  select count(*) into v_before from public.bookings where student_id = stu;

  -- horario comum aos tres e livre para o aluno
  select c.st into v_s from (select (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => d, hours => h)) at time zone 'America/Fortaleza' st
      from generate_series(6, 150) d cross join generate_series(8, 13) h) c
   where public.instructor_can_attend(a1, jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', 2)))
     and public.instructor_can_attend(a2, jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', 2)))
     and public.instructor_can_attend(c3, jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', 2)))
     and not exists (select 1 from public.booking_meetings m join public.bookings k on k.id = m.booking_id where k.student_id = stu and m.status::text <> 'cancelled' and k.status::text in ('confirmed','awaiting_payment')
          and tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.minutes), '[)') && tstzrange(c.st - interval '3 hours', c.st + interval '5 hours', '[)'))
   order by c.st limit 1;
  assert v_s is not null, 'FIXTURE: sem horario comum para os tres instrutores';

  -- ---------------- 4. o executor nao e chamavel pela API ----------------
  assert not has_function_privilege('anon', 'public.advance_instructor_offer(uuid)'::regprocedure, 'EXECUTE')
     and not has_function_privilege('authenticated', 'public.advance_instructor_offer(uuid)'::regprocedure, 'EXECUTE'),
     '4: advance_instructor_offer nao pode ser executavel por anon/authenticated (so pelo executor de servico)';
  assert not has_function_privilege('anon', 'public.run_queue_expiry_job(integer)'::regprocedure, 'EXECUTE') and not has_function_privilege('authenticated', 'public.run_queue_expiry_job(integer)'::regprocedure, 'EXECUTE')
     and not has_function_privilege('anon', 'public.run_expiry_jobs()'::regprocedure, 'EXECUTE') and not has_function_privilege('authenticated', 'public.run_expiry_jobs()'::regprocedure, 'EXECUTE'),
     '4: os jobs de expiracao nao podem ser executaveis por anon/authenticated';

  -- ---------------- 1. A -> B -> C por expiracao, so com o executor ----------------
  perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
  v_req := public.create_instructor_request(v_prea, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', v_s, 'hours', 2)));
  execute 'reset role';                                    -- a partir daqui NENHUMA sessao de aluno/instrutor
  for i in 1 .. 3 loop
    select id, instructor_id into strict v_offer, v_inst from public.instructor_offers where request_id = v_req and status = 'offered';
    assert not (v_inst = any (v_seen)), format('1: instrutor %s oferecido duas vezes', v_inst);
    v_seen := v_seen || v_inst;
    update public.instructor_offers set expires_at = now() - interval '1 second' where id = v_offer;   -- o prazo da oferta passou
    v_n := public.run_queue_expiry_job();                                                                -- o job roda sozinho
    assert v_n >= 1, '1: o job deveria ter avancado ao menos este pedido';
    assert (select status from public.instructor_offers where id = v_offer) = 'expired', format('1: a oferta %s deveria expirar', i);
  end loop;
  assert array_length(v_seen, 1) = 3 and v_seen @> array[a1, a2, c3], '1: os tres instrutores elegiveis deveriam ter recebido a oferta, um por vez';
  assert not exists (select 1 from public.instructor_offers where request_id = v_req and status = 'offered'), '1: nao ha mais ninguem para oferecer';
  assert (select status from public.instructor_requests where id = v_req) = 'searching', '1: ate o fim da janela de busca o pedido segue buscando';
  assert (select count(*) from public.bookings where student_id = stu) = v_before, '1: nenhuma reserva foi criada';
  update public.instructor_requests set expires_at = now() - interval '1 second' where id = v_req;       -- fim da janela de busca
  perform public.run_queue_expiry_job();
  assert (select status from public.instructor_requests where id = v_req) = 'expired', '1: terminada a janela o pedido expira sozinho';
  perform public.run_queue_expiry_job(); perform public.run_expiry_jobs();                                -- reexecutar nao muda nada
  assert (select count(*) from public.instructor_offers where request_id = v_req) = 3 and (select status from public.instructor_requests where id = v_req) = 'expired', '1: executor idempotente apos expirar';

  -- ---------------- 2. A expira, B recusa, C aceita ----------------
  perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
  v_req := public.create_instructor_request(v_prea, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', v_s, 'hours', 2)));
  execute 'reset role';
  select id, instructor_id into strict v_ofa, v_a from public.instructor_offers where request_id = v_req and status = 'offered';
  update public.instructor_offers set expires_at = now() - interval '1 second' where id = v_ofa;
  v_js := public.run_expiry_jobs();                                                                        -- A expira sozinho
  assert (v_js ->> 'instructor_requests')::int >= 1 and (v_js ->> 'meeting_changes')::int >= 0 and (v_js ->> 'balance_requests')::int >= 0, '2: o job conjunto nao pode falhar: ' || v_js::text;
  select id, instructor_id into strict v_ofb, v_b from public.instructor_offers where request_id = v_req and status = 'offered';
  assert v_b <> v_a, '2: a oferta passou para outro instrutor';
  perform set_config('request.jwt.claim.sub', v_b::text, true); execute 'set local role authenticated';
  perform public.decline_instructor_offer(v_ofb);                                                         -- B recusa
  execute 'reset role';
  select id, instructor_id into strict v_ofc, v_c from public.instructor_offers where request_id = v_req and status = 'offered';
  assert v_c not in (v_a, v_b), '2: a terceira oferta vai para o instrutor que falta';
  perform set_config('request.jwt.claim.sub', v_c::text, true); execute 'set local role authenticated';
  v_bk := public.accept_instructor_offer(v_ofc);                                                          -- C aceita
  execute 'reset role';
  assert v_bk is not null, '2: C deveria receber a reserva';
  perform public.run_queue_expiry_job(); perform public.run_expiry_jobs();                               -- job reexecutado
  assert (select count(*) from public.instructor_offers where request_id = v_req) = 3, '2: o executor nao cria ofertas depois do aceite';
  assert (select count(*) from public.bookings where student_id = stu and created_at >= v_t0) = 1, '2: exatamente UMA reserva';
  assert (select instructor_id from public.bookings where id = v_bk) = v_c and (select count(*) from public.booking_meetings where booking_id = v_bk) = 1, '2: reserva de C com o encontro';

  -- ---------------- 3. o mesmo estado para Aluno, Instrutor e Admin ----------------
  perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
  select status || ':' || coalesce(booking_id::text, '-') into v_status from public.instructor_requests where id = v_req;
  select count(*) into v_n from public.booking_meetings where booking_id = v_bk;
  execute 'reset role';
  assert v_status = 'accepted:' || v_bk::text, '3: o aluno ve o pedido aceito com a reserva: ' || coalesce(v_status, 'nada');
  assert v_n = 1, '3: o aluno ve o encontro da reserva';
  foreach v_inst in array array[v_a, v_b, v_c] loop
    perform set_config('request.jwt.claim.sub', v_inst::text, true); execute 'set local role authenticated';
    select status into v_o from public.instructor_offers where id = (select id from public.instructor_offers where request_id = v_req and instructor_id = v_inst);
    select count(*) into v_n from public.booking_meetings where booking_id = v_bk;
    execute 'reset role';
    assert v_o = case when v_inst = v_a then 'expired' when v_inst = v_b then 'declined' else 'accepted' end, format('3: oferta de %s com estado errado: %s', v_inst, v_o);
    assert v_n = case when v_inst = v_c then 1 else 0 end, format('3: so o instrutor vencedor ve o encontro (%s viu %s)', v_inst, v_n);
  end loop;
  perform set_config('request.jwt.claim.sub', adm::text, true); execute 'set local role authenticated';
  select string_agg(status, ',' order by status) into v_o from public.instructor_offers where request_id = v_req;
  select status into v_status from public.instructor_requests where id = v_req;
  execute 'reset role';
  assert v_o = 'accepted,declined,expired' and v_status = 'accepted', '3: o admin ve as tres ofertas e o pedido aceito: ' || coalesce(v_o, '-') || ' / ' || coalesce(v_status, '-');

  -- deixa o fixture compartilhado neutro para os proximos scripts
  update public.bookings set status = 'cancelled', cancelled_at = now() where student_id = stu and created_at >= v_t0 and status::text in ('awaiting_payment', 'confirmed');
  raise notice 'PASS: executor offline: A->B->C por expiracao sem sessao aberta; A expira, B recusa, C aceita (1 reserva); Aluno, Instrutor e Admin veem o mesmo estado';
end $$;
SQL
