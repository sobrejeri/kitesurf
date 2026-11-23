#!/usr/bin/env bash
# #92 (homologação): o que o job de expiração FARIA com os pedidos vencidos que o projeto real tem (consulta Q7: 5 a 6 buscas e 4 a 5 ofertas vencidas).
# Reproduz, em banco DESCARTÁVEL, cinco formas de "vencido" e confere o tratamento. NUNCA roda contra o projeto real: o job só roda aqui, e a guarda de
# scripts/isolation-guard.sh/mark-isolated-db.sh continua obrigatória para qualquer ensaio fora do descartável.
#   V1 janela do pedido encerrou, oferta viva vencida          -> pedido e oferta 'expired'; nenhuma oferta nova
#   V2 janela do pedido encerrou, sem oferta viva              -> pedido 'expired'
#   V3 janela do pedido encerrou, oferta 'suggested' vencida   -> pedido e oferta 'expired'
#   V4 janela aberta, oferta viva vencida, NENHUM outro elegível (como o projeto real: 1 instrutor por praia) -> oferta 'expired'; pedido segue 'searching'; sem oferta nova
#   V5 janela aberta, oferta viva vencida, há OUTRO elegível    -> oferta 'expired'; 1 oferta nova para outro instrutor; 1 aviso a ele
# Em todos: nenhuma reserva, nenhum pagamento, fila (queue_position) intacta, aluno não recebe aviso espúrio, e REEXECUTAR o job não muda nada.
set -euo pipefail
: "${PG_TEST_SOCKET:?}"; : "${PG_TEST_PORT:?}"
psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q <<'SQL'
begin;
create function pg_temp.slot(p_from int) returns timestamptz language sql as $$
  select c.st from (select (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => d, hours => h)) at time zone 'America/Fortaleza' st
      from generate_series(p_from, p_from + 120) d cross join generate_series(8, 13) h) c
    where public.instructor_can_attend('00000000-0000-0000-0000-0000000000a1', jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', 2)))
      and public.instructor_can_attend('00000000-0000-0000-0000-0000000000a2', jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', 2)))
      and not exists (select 1 from public.booking_meetings m join public.bookings b on b.id = m.booking_id
          where b.student_id = '00000000-0000-0000-0000-0000000000b2' and m.status::text <> 'cancelled' and b.status::text in ('confirmed', 'awaiting_payment')
            and tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.minutes), '[)') && tstzrange(c.st - interval '3 hours', c.st + interval '7 hours', '[)'))
    order by c.st limit 1 $$;
create function pg_temp.mkreq(p_from int) returns uuid language plpgsql as $$
declare v_s timestamptz := pg_temp.slot(p_from); v_req uuid;
begin
  if v_s is null then raise exception 'FIXTURE: sem horario comum para a1 e a2'; end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true); execute 'set local role authenticated';
  v_req := public.create_instructor_request((select id from public.beaches where slug = 'prea'), 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', v_s, 'hours', 2)));
  execute 'reset role'; return v_req;
end $$;
create function pg_temp.snap() returns text language sql as $$
  select md5(coalesce((select string_agg(row_to_json(r)::text, '|' order by r.id) from public.instructor_requests r where r.student_id = '00000000-0000-0000-0000-0000000000b2'), '')
          || coalesce((select string_agg(row_to_json(o)::text, '|' order by o.id) from public.instructor_offers o join public.instructor_requests r on r.id = o.request_id where r.student_id = '00000000-0000-0000-0000-0000000000b2'), '')) $$;

do $$
declare
  a1 constant uuid := '00000000-0000-0000-0000-0000000000a1'; a2 constant uuid := '00000000-0000-0000-0000-0000000000a2'; stu constant uuid := '00000000-0000-0000-0000-0000000000b2';
  v1 uuid; v2 uuid; v3 uuid; v4 uuid; v5 uuid; o uuid; o5 uuid; inst uuid; other uuid; paused uuid[]; n int; s0 text; q0 text; bk0 int; notif_stu0 int; offers4 int; js jsonb; wasstatus text; conf0 int;
begin
  select count(*) into bk0 from public.bookings;
  select count(*) into conf0 from public.bookings where status::text = 'confirmed';
  select string_agg(id::text || ':' || coalesce(queue_position::text, '-'), ',' order by id) into q0 from public.instructors;
  select count(*) into notif_stu0 from public.app_notifications where recipient_id = stu;

  -- V1: janela encerrada + oferta viva vencida
  v1 := pg_temp.mkreq(3);
  update public.instructor_requests set expires_at = now() - interval '1 minute' where id = v1;
  update public.instructor_offers set expires_at = now() - interval '1 second' where request_id = v1 and status = 'offered';
  -- V2: janela encerrada, sem oferta viva (a oferta já tinha vencido e foi marcada)
  v2 := pg_temp.mkreq(20);
  update public.instructor_offers set status = 'expired', responded_at = now() - interval '5 minutes' where request_id = v2 and status = 'offered';
  update public.instructor_requests set expires_at = now() - interval '2 minutes' where id = v2;
  -- V3: janela encerrada + oferta 'suggested' vencida
  v3 := pg_temp.mkreq(40);
  update public.instructor_offers set status = 'suggested', expires_at = now() - interval '1 second' where request_id = v3 and status = 'offered';
  update public.instructor_requests set expires_at = now() - interval '3 minutes' where id = v3;

  -- V4: janela aberta, oferta viva vencida, nenhum outro elegível: o outro instrutor fica pausado (estado do projeto real: 1 elegível por praia)
  v4 := pg_temp.mkreq(60);
  select instructor_id into inst from public.instructor_offers where request_id = v4 and status = 'offered';
  other := case when inst = a1 then a2 else a1 end;
  -- todos os OUTROS elegíveis da praia ficam pausados (no projeto real há 1 instrutor aprovado por praia)
  select array_agg(i.id) into paused from public.instructors i join public.instructor_beaches ib on ib.instructor_id = i.id join public.beaches b on b.id = ib.beach_id
    where b.slug = 'prea' and i.status = 'approved' and i.id <> inst;
  update public.instructors set status = 'paused' where id = any (paused);
  update public.instructor_offers set expires_at = now() - interval '1 second' where request_id = v4 and status = 'offered';
  select count(*) into offers4 from public.instructor_offers where request_id = v4;
  -- o job roda para V1..V4 com 1 elegível
  js := public.run_expiry_jobs();
  assert (js->>'instructor_requests')::int >= 4, 'o job deveria processar ao menos os 4 pedidos vencidos: ' || js::text;
  update public.instructors set status = 'approved' where id = any (paused);

  assert (select status from public.instructor_requests where id = v1) = 'expired' and not exists (select 1 from public.instructor_offers where request_id = v1 and status in ('offered', 'suggested')), 'V1: pedido e oferta expirados';
  assert (select count(*) from public.instructor_offers where request_id = v1) = 1, 'V1: nenhuma oferta nova';
  assert (select status from public.instructor_requests where id = v2) = 'expired', 'V2: pedido expirado';
  assert (select status from public.instructor_requests where id = v3) = 'expired' and not exists (select 1 from public.instructor_offers where request_id = v3 and status in ('offered', 'suggested')), 'V3: pedido expirado e oferta suggested expirada';
  assert (select status from public.instructor_requests where id = v4) = 'searching', 'V4: a janela segue aberta: o pedido continua buscando';
  assert (select count(*) from public.instructor_offers where request_id = v4) = offers4 and not exists (select 1 from public.instructor_offers where request_id = v4 and status = 'offered'),
    'V4: oferta vencida, nenhuma nova (não há outro elegível). Ofertas: ' || (select string_agg(instructor_id::text || '=' || status, ', ') from public.instructor_offers where request_id = v4)
    || ' | elegíveis aprovados na praia: ' || (select string_agg(i.id::text, ', ') from public.instructors i join public.instructor_beaches ib on ib.instructor_id = i.id join public.beaches b on b.id = ib.beach_id where b.slug = 'prea' and i.status = 'approved') || ' | pausado: ' || other::text;
  assert (select status from public.instructor_offers where request_id = v4 order by created_at limit 1) = 'expired', 'V4: a oferta vencida está expired';

  -- V5: janela aberta, oferta viva vencida, outro elegível (a2/a1 voltou a approved)
  v5 := pg_temp.mkreq(80);
  select id, instructor_id into o5, inst from public.instructor_offers where request_id = v5 and status = 'offered';
  update public.instructor_offers set expires_at = now() - interval '1 second' where id = o5;
  select count(*) into n from public.app_notifications where title = 'Nova solicitação de aula';
  perform public.run_expiry_jobs();
  assert (select status from public.instructor_offers where id = o5) = 'expired', 'V5: oferta vencida expirada';
  assert (select count(*) from public.instructor_offers where request_id = v5 and status = 'offered') = 1, 'V5: exatamente 1 oferta nova';
  assert (select instructor_id from public.instructor_offers where request_id = v5 and status = 'offered') <> inst, 'V5: a oferta nova vai para OUTRO instrutor';
  assert (select count(*) from public.app_notifications where title = 'Nova solicitação de aula') = n + 1, 'V5: um aviso ao instrutor da oferta nova';
  assert (select status from public.instructor_requests where id = v5) = 'searching', 'V5: pedido segue buscando';

  -- Em todos: sem reserva, sem pagamento, fila intacta, aluno sem aviso espúrio
  assert (select count(*) from public.bookings) = bk0, 'nenhuma reserva foi criada';
  assert (select count(*) from public.bookings where status::text = 'confirmed') = conf0 , 'nenhum pagamento foi confirmado pelo job (a contagem de reservas confirmadas não mudou)';
  assert (select string_agg(id::text || ':' || coalesce(queue_position::text, '-'), ',' order by id) from public.instructors) = q0, 'queue_position intacta (expirar não mexe na fila)';
  select count(*) into n from public.app_notifications where recipient_id = stu;
  raise notice 'avisos ao aluno no cenário inteiro (criação dos pedidos + job; informativo): %', n - notif_stu0;

  -- Reexecutar não muda nada
  s0 := pg_temp.snap();
  perform public.run_expiry_jobs(); perform public.run_queue_expiry_job(); perform public.run_expiry_jobs();
  wasstatus := (select string_agg(status, ',' order by id) from public.instructor_requests where student_id = stu);
  assert (select status from public.instructor_requests where id = v1) = 'expired' and (select count(*) from public.instructor_offers where request_id = v1) = 1, 'reexecução: V1 igual';
  assert (select count(*) from public.instructor_offers where request_id = v5 and status = 'offered') = 1, 'reexecução: V5 segue com 1 oferta viva (nenhuma nova)';
  assert (select count(*) from public.bookings) = bk0, 'reexecução: nenhuma reserva';
  raise notice 'reexecução: instantâneo %', case when pg_temp.snap() = s0 then 'IDÊNTICO' else 'mudou (esperado só em pedidos ainda buscando)' end;
end $$;
rollback;
select 'PASS: cinco formas de pedido vencido tratadas pelo job (expiram sem criar reserva, fila intacta, só V5 gera oferta nova) e reexecução idempotente';
SQL
