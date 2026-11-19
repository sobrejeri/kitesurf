#!/usr/bin/env bash
# P0 #92 (fila/ofertas), bordas que o teste A->B->C não cobre. Só no banco descartável de scripts/test-db.sh.
#  E1 aceite FORA DO PRAZO (oferta vencida, job ainda não rodou): não cria reserva, vence a oferta e passa para o próximo elegível
#  E2 redistribuição até acabar os elegíveis: pedido termina 'expired', ninguém é oferecido duas vezes, aluno pode pedir de novo
#  E3 instrutor errado aceita/recusa oferta alheia: 'Offer not found', nada muda
#  E4 aceite duplo: uma única reserva
#  E5 o aluno ganha um encontro sobreposto enquanto a oferta está aberta: o aceite NÃO pode deixar o pedido preso nem lançar erro cru
set -euo pipefail
: "${PG_TEST_SOCKET:?Disposable database socket required}"
: "${PG_TEST_PORT:?Disposable database port required}"
psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare
  stu constant uuid := '00000000-0000-0000-0000-0000000000b2';
  a1 constant uuid := '00000000-0000-0000-0000-0000000000a1';
  a2 constant uuid := '00000000-0000-0000-0000-0000000000a2';
  v_prea uuid; v_jeri uuid; v_guriu uuid;
  v_s timestamptz; v_req uuid; v_offer uuid; v_x uuid; v_y uuid; v_ret uuid; v_n int; v_hint text; v_state text; v_other_beach uuid;
  v_bk uuid; v_total_offers int; v_bookings_before int;

  v_guarded boolean := false;
  v_t0 timestamptz := now();
begin
  select id into strict v_prea from public.beaches where slug = 'prea';
  select id into strict v_jeri from public.beaches where slug = 'jeri';
  select id into strict v_guriu from public.beaches where slug = 'praia-do-guriu';
  select count(*) into v_bookings_before from public.bookings where student_id = stu;

  -- ---------------- E1: aceite fora do prazo ----------------
  select st into v_s from (select (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => d, hours => h)) at time zone 'America/Fortaleza' st
      from generate_series(4, 90) d cross join generate_series(8, 13) h) c
    where public.instructor_can_attend(a1, jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', 2)))
      and public.instructor_can_attend(a2, jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', 2)))
      and not exists (select 1 from public.booking_meetings m join public.bookings b on b.id = m.booking_id
          where b.student_id = stu and m.status::text <> 'cancelled' and b.status::text in ('confirmed', 'awaiting_payment')
            and tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.minutes), '[)') && tstzrange(c.st - interval '3 hours', c.st + interval '7 hours', '[)'))
    order by c.st limit 1;
  if v_s is null then raise exception 'FIXTURE: sem horario comum para a1 e a2'; end if;

  perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
  v_req := public.create_instructor_request(v_prea, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', v_s, 'hours', 2)));
  execute 'reset role';
  select id, instructor_id into strict v_offer, v_x from public.instructor_offers where request_id = v_req and status = 'offered';

  update public.instructor_offers set expires_at = now() - interval '1 second' where id = v_offer;   -- venceu, mas ninguém avançou a fila
  perform set_config('request.jwt.claim.sub', v_x::text, true); execute 'set local role authenticated';
  v_ret := public.accept_instructor_offer(v_offer);
  execute 'reset role';
  assert v_ret is null, 'E1: aceite fora do prazo nao pode criar reserva';
  assert (select count(*) from public.bookings where student_id = stu) = v_bookings_before, 'E1: reserva criada indevidamente';
  assert (select status from public.instructor_offers where id = v_offer) = 'expired', 'E1: a oferta vencida deve ficar expired';
  assert (select status from public.instructor_requests where id = v_req) = 'searching', 'E1: o pedido segue buscando';
  select id, instructor_id into strict v_offer, v_y from public.instructor_offers where request_id = v_req and status = 'offered';
  assert v_y <> v_x, 'E1: a proxima oferta precisa ir para outro instrutor elegivel';

  -- ---------------- E3: instrutor errado ----------------
  declare got text := 'ok'; begin
    perform set_config('request.jwt.claim.sub', v_x::text, true); execute 'set local role authenticated';   -- x NAO e o dono da oferta de y
    begin perform public.accept_instructor_offer(v_offer); exception when others then got := sqlstate; end;
    assert got = 'P0002', 'E3: aceitar oferta alheia deve dar Offer not found, obteve ' || got;
    got := 'ok';
    begin perform public.decline_instructor_offer(v_offer); exception when others then got := sqlstate; end;
    assert got = 'P0002', 'E3: recusar oferta alheia deve dar Offer not found, obteve ' || got;
    execute 'reset role';
    assert (select status from public.instructor_offers where id = v_offer) = 'offered', 'E3: oferta alheia foi alterada';
  end;

  -- ---------------- E2: y recusa; acabaram os elegiveis -> pedido expira, sem repetir ninguem ----------------
  perform set_config('request.jwt.claim.sub', v_y::text, true); execute 'set local role authenticated';
  perform public.decline_instructor_offer(v_offer);
  execute 'reset role';
  -- Sem mais elegiveis nao ha oferta viva; o pedido segue 'searching' ate o fim da janela de busca (desenho: 6 min) e so entao expira.
  assert not exists (select 1 from public.instructor_offers where request_id = v_req and status = 'offered'), 'E2: sobrou oferta viva sem elegiveis';
  assert (select status from public.instructor_requests where id = v_req) = 'searching', 'E2: antes do fim da janela o pedido segue buscando';
  assert (select count(*) from public.bookings where student_id = stu) = v_bookings_before, 'E2: nenhuma reserva deve existir';
  update public.instructor_requests set expires_at = now() - interval '1 second' where id = v_req;   -- a janela de busca terminou
  perform public.advance_instructor_offer(v_req);
  assert (select status from public.instructor_requests where id = v_req) = 'expired', 'E2: terminada a janela o pedido deve expirar';
  assert (select count(*) from public.instructor_offers where request_id = v_req and status in ('offered', 'suggested')) = 0, 'E2: expirar o pedido nao pode deixar oferta aberta';
  assert (select count(*) from (select instructor_id from public.instructor_offers where request_id = v_req group by 1 having count(*) > 1) d) = 0, 'E2: instrutor oferecido duas vezes';

  -- O aluno pode pedir de novo o mesmo horario (o pedido expirado nao o bloqueia).
  perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
  v_req := public.create_instructor_request(v_prea, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', v_s, 'hours', 2)));
  execute 'reset role';
  select id, instructor_id into strict v_offer, v_x from public.instructor_offers where request_id = v_req and status = 'offered';

  -- ---------------- E4: aceite duplo -> uma reserva ----------------
  perform set_config('request.jwt.claim.sub', v_x::text, true); execute 'set local role authenticated';
  v_bk := public.accept_instructor_offer(v_offer);
  v_ret := public.accept_instructor_offer(v_offer);
  execute 'reset role';
  assert v_bk is not null, 'E4: o primeiro aceite deve criar a reserva';
  assert v_ret is null, 'E4: o segundo aceite nao pode criar outra reserva';
  assert (select count(*) from public.bookings where student_id = stu) = v_bookings_before + 1, 'E4: deveria haver exatamente uma reserva nova';
  assert (select count(*) from public.booking_meetings where booking_id = v_bk) = 1, 'E4: um encontro';

  -- ---------------- E5: o aluno ganha um encontro sobreposto com a oferta aberta ----------------
  select st into v_s from (select (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => d, hours => h)) at time zone 'America/Fortaleza' st
      from generate_series(4, 120) d cross join generate_series(8, 13) h) c
    where public.instructor_can_attend(a1, jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', 2)))
      and public.instructor_can_attend(a2, jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', 2)))
      and public.instructor_can_attend(a1, jsonb_build_array(jsonb_build_object('starts_at', c.st + interval '30 minutes', 'hours', 2)))
      and public.instructor_can_attend(a2, jsonb_build_array(jsonb_build_object('starts_at', c.st + interval '30 minutes', 'hours', 2)))
      and not exists (select 1 from public.booking_meetings m join public.bookings b on b.id = m.booking_id
          where b.student_id = stu and m.status::text <> 'cancelled' and b.status::text in ('confirmed', 'awaiting_payment')
            and tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.minutes), '[)') && tstzrange(c.st - interval '3 hours', c.st + interval '7 hours', '[)'))
    order by c.st limit 1;
  if v_s is null then raise exception 'FIXTURE: sem horario para E5'; end if;
  select count(*) into v_bookings_before from public.bookings where student_id = stu;
  perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
  v_req := public.create_instructor_request(v_prea, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', v_s, 'hours', 2)));
  execute 'reset role';
  select id, instructor_id into strict v_offer, v_x from public.instructor_offers where request_id = v_req and status = 'offered';
  -- Reserva direta do mesmo aluno, sobreposta, num instrutor DIFERENTE de x (praia onde so x nao atende).
  v_other_beach := case when v_x = a2 then v_jeri else v_guriu end;
  declare got text := 'ok'; begin
    perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
    begin
      perform public.create_booking(v_other_beach, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', v_s + interval '30 minutes', 'hours', 2)));
    exception when others then got := sqlstate; end;
    execute 'reset role';
    if got <> 'ok' then
      raise notice 'E5: a reserva direta sobreposta ja foi barrada no create_booking (%): pedido aberto e reserva nao coexistem', got;
      select count(*) into v_n from public.bookings where student_id = stu;
      assert v_n = v_bookings_before, 'E5: reserva barrada nao pode deixar rastro';
      v_guarded := true;
    end if;
  end;
  -- A reserva direta foi aceita; agora x aceita a oferta antiga. Nao pode lancar erro cru nem deixar o pedido preso.
  if not v_guarded then declare got text := 'ok'; begin
    perform set_config('request.jwt.claim.sub', v_x::text, true); execute 'set local role authenticated';
    begin v_ret := public.accept_instructor_offer(v_offer); exception when others then got := sqlstate; get stacked diagnostics v_hint = pg_exception_hint; end;
    execute 'reset role';
    assert got = 'ok', format('E5: aceite com conflito do aluno lancou erro cru (%s / %s) e deixou a oferta presa', got, coalesce(v_hint, '-'));
    assert v_ret is null, 'E5: aceite com conflito do aluno nao pode criar segunda reserva';
    assert exists (select 1 from public.app_notifications where recipient_id = stu and title = 'Busca de instrutor encerrada' and created_at >= v_t0), 'E5: o aluno precisa ser avisado de que a busca foi encerrada';
    assert (select status from public.instructor_requests where id = v_req) <> 'searching' or not exists (select 1 from public.instructor_offers where request_id = v_req and status = 'offered' and id = v_offer),
      'E5: o pedido ficou preso com a oferta aberta';
    assert (select count(*) from public.booking_meetings m join public.bookings b on b.id = m.booking_id where b.student_id = stu and m.status::text <> 'cancelled' and b.status::text in ('confirmed','awaiting_payment')
            and tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.minutes), '[)') && tstzrange(v_s, v_s + interval '150 minutes', '[)')) = 1, 'E5: o aluno deve ter um unico encontro ativo na janela';
  end; end if;
  -- Deixa o fixture compartilhado neutro: os scripts seguintes escolhem os primeiros horarios livres do aluno e nao devem esbarrar nestas reservas.
  update public.bookings set status = 'cancelled', cancelled_at = now() where student_id = stu and created_at >= v_t0 and status::text in ('awaiting_payment', 'confirmed');
  raise notice 'PASS: fila - aceite fora do prazo, oferta alheia, redistribuicao ate esgotar, aceite duplo e conflito do aluno no aceite';
end $$;
SQL
