-- Cancelamento de reserva aguardando pagamento (retenção de 10 min): sem pagamento aprovado, estado dos pagamentos em processamento registrado,
-- idempotência, auditoria em TODOS os caminhos (varredura do create_booking e da guarda de agenda do aluno) e confirmação tardia recusada.
-- Pagamentos são só os de TESTE (test_payment_attempts); nenhum dinheiro. Descartável, tudo revertido.
\set ON_ERROR_STOP on
begin;
create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', uid, false); execute 'set role authenticated'; end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', false); end $$;
create function pg_temp.try(q text, who text) returns text language plpgsql as $$
declare st text; msg text;
begin
  perform pg_temp.act_as(who);
  begin execute q; exception when others then get stacked diagnostics msg = message_text; st := sqlstate; end;
  perform pg_temp.reset();
  return coalesce(st || ':' || msg, 'ok');
end $$;
create function pg_temp.hold(student text, st timestamptz) returns uuid language plpgsql as $$
declare bk uuid;
begin
  perform pg_temp.act_as(student);
  bk := public.create_booking((select id from public.beaches where slug = 'jeri'), 'first_time', 'Português',
          jsonb_build_array(jsonb_build_object('starts_at', st, 'hours', 1)));
  perform pg_temp.reset();
  return bk;
end $$;
create function pg_temp.age(b uuid, minutes int) returns void language plpgsql as $$
begin
  alter table public.bookings disable trigger bookings_snapshot_frozen;
  update public.bookings set created_at = now() - make_interval(mins => minutes) where id = b;
  alter table public.bookings enable trigger bookings_snapshot_frozen;
end $$;

do $$
declare
  b1 constant text := '00000000-0000-0000-0000-0000000000b1';
  b2 constant text := '00000000-0000-0000-0000-0000000000b2';
  d date := (now() at time zone 'America/Fortaleza')::date + 60;
  slots timestamptz[]; s1 timestamptz; s2 timestamptz; s3 timestamptz; h1 uuid; h2 uuid; h3 uuid; n int; j jsonb; attempts int;
begin
  -- horários elegíveis do instrutor de jeri (a agenda salva por outros testes pode restringir dias e horas): 8 dias locais distintos
  select array_agg(st order by st) into slots from (
    select distinct on ((st at time zone 'America/Fortaleza')::date) st from (
      select (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => g, hours => h)) at time zone 'America/Fortaleza' st
        from generate_series(50, 120) g cross join generate_series(8, 15) h) q
     where public.instructor_can_attend('00000000-0000-0000-0000-0000000000a1'::uuid, jsonb_build_array(jsonb_build_object('starts_at', st, 'hours', 1)))
     order by (st at time zone 'America/Fortaleza')::date, st) z;
  assert coalesce(array_length(slots, 1), 0) >= 9, 'FIXTURE: poucos dias elegíveis (' || coalesce(array_length(slots, 1), 0) || ')';
  s1 := slots[1]; s2 := slots[2]; s3 := slots[3];

  -- 1) retenção vencida varrida pelo create_booking: cancelada, auditada UMA vez, com o estado dos pagamentos
  h1 := pg_temp.hold(b1, s1);
  assert (select status::text from public.bookings where id = h1) = 'awaiting_payment', 'FIXTURE: retenção em pagamento';
  perform pg_temp.age(h1, 11);
  h2 := pg_temp.hold(b2, s2);                                         -- esta chamada varre a retenção vencida de b1
  assert (select status::text from public.bookings where id = h1) = 'cancelled', 'a varredura cancelou a retenção vencida';
  select count(*) into n from public.audit_logs where action = 'booking.hold_cancelled' and entity_id = h1::text;
  assert n = 1, 'auditada exatamente uma vez: ' || n;
  j := (select new_state from public.audit_logs where action = 'booking.hold_cancelled' and entity_id = h1::text);
  assert (j->>'had_approved_payment')::boolean = false and (j->>'had_pending_payment')::boolean = false, 'sem pagamento aprovado nem em processamento';
  assert (j->>'held_minutes')::int >= 11, 'registra por quanto tempo ficou retida';
  assert (select count(*) from public.test_payment_attempts where booking_id = h1) = 0, 'nenhuma tentativa de pagamento criada pelo cancelamento';

  -- 2) idempotência: novas varreduras não auditam de novo nem mudam nada
  perform pg_temp.age(h2, 0);
  h3 := pg_temp.hold(b2, s3);                                         -- outra varredura
  update public.bookings set status = 'cancelled' where id = h1;       -- UPDATE sem transição (já cancelada)
  select count(*) into n from public.audit_logs where action = 'booking.hold_cancelled' and entity_id = h1::text;
  assert n = 1, 'idempotente: continua uma única auditoria: ' || n;

  -- 3) confirmação tardia recusada, sem efeito colateral
  perform pg_temp.age(h3, 0);
  assert pg_temp.try(format('select public.confirm_test_payment(%L)', h1), b1) like '55000:%', 'confirm_test_payment após o cancelamento é recusado';
  assert pg_temp.try(format('select public.confirm_validation_lesson(%L)', h1), b1) like '55000:%', 'confirm_validation_lesson após o cancelamento é recusado';
  assert pg_temp.try(format('select public.simulate_test_payment(%L, ''pix'', ''approved'')', h1), b1) like '55000:%', 'pagamento simulado aprovado após o cancelamento é recusado';
  assert pg_temp.try(format('select public.simulate_test_payment(%L, ''pix'', ''pending'')', h1), b1) like '55000:%', 'pagamento simulado em processamento após o cancelamento é recusado';
  assert (select status::text from public.bookings where id = h1) = 'cancelled' and (select confirmed_at from public.bookings where id = h1) is null, 'continua cancelada e sem confirmação';
  assert (select count(*) from public.test_payment_attempts where booking_id = h1) = 0, 'nenhuma tentativa registrada pela confirmação tardia';
  -- janela vencida mas ainda NÃO varrida: também recusada
  perform pg_temp.age(h2, 11);
  assert pg_temp.try(format('select public.confirm_test_payment(%L)', h2), b2) like '55000:%', 'confirmar fora da janela (ainda sem varredura) é recusado';
  assert pg_temp.try(format('select public.confirm_validation_lesson(%L)', h2), b2) like '55000:%', 'validar fora da janela é recusado';

  -- 4) pagamento EM PROCESSAMENTO: a política atual cancela ao fim da janela, mas o estado fica REGISTRADO na auditoria
  perform pg_temp.age(h2, 0);
  assert pg_temp.try(format('select public.simulate_test_payment(%L, ''pix'', ''pending'')', h2), b2) = 'ok', 'FIXTURE: pagamento em processamento';
  assert (select status::text from public.bookings where id = h2) = 'awaiting_payment', 'processando: segue aguardando';
  perform pg_temp.age(h2, 11);
  perform pg_temp.hold(b1, slots[4]);                    -- varredura
  assert (select status::text from public.bookings where id = h2) = 'cancelled', 'política atual: ao fim da janela a retenção cancela mesmo em processamento';
  j := (select new_state from public.audit_logs where action = 'booking.hold_cancelled' and entity_id = h2::text);
  assert (j->>'had_pending_payment')::boolean = true and (j->>'had_approved_payment')::boolean = false, 'a auditoria registra que havia pagamento em processamento';
  assert pg_temp.try(format('select public.simulate_test_payment(%L, ''card'', ''approved'')', h2), b2) like '55000:%', 'aprovação tardia do pagamento que estava em processamento é recusada';
  assert (select status::text from public.bookings where id = h2) = 'cancelled', 'continua cancelada';

  -- 5) trava: não se cancela retenção com pagamento APROVADO (não pode ocorrer; defesa em profundidade)
  declare h4 uuid; begin
    h4 := pg_temp.hold(b1, slots[5]);
    insert into public.test_payment_attempts (booking_id, student_id, method, outcome) values (h4, b1::uuid, 'pix', 'approved');
    begin
      update public.bookings set status = 'cancelled' where id = h4;
      raise exception 'cancelou retenção com pagamento aprovado';
    exception when sqlstate '55000' then null; end;
    assert (select status::text from public.bookings where id = h4) = 'awaiting_payment', 'a trava manteve a retenção';
    -- a trava não afeta reserva confirmada que depois é cancelada por outro caminho
    delete from public.test_payment_attempts where booking_id = h4;
  end;

  -- 6) caminho da guarda de agenda do aluno (INSERT em instructor_requests varre as retenções vencidas do próprio aluno)
  declare h5 uuid; r uuid; begin
    h5 := pg_temp.hold(b2, slots[6]);
    perform pg_temp.age(h5, 11);
    perform pg_temp.act_as(b2);
    r := public.create_instructor_request((select id from public.beaches where slug = 'prea'), 'first_time', 'Português',
           jsonb_build_array(jsonb_build_object('starts_at', slots[7], 'hours', 1)), null::text, false);
    perform pg_temp.reset();
    assert (select status::text from public.bookings where id = h5) = 'cancelled', 'a guarda de agenda varreu a retenção vencida do aluno';
    assert (select count(*) from public.audit_logs where action = 'booking.hold_cancelled' and entity_id = h5::text) = 1, 'também auditada nesse caminho';
  end;
end $$;
rollback;
select 'PASS: cancelamento de reserva aguardando pagamento: auditado em todos os caminhos, idempotente, sem pagamento aprovado, processamento registrado e confirmação tardia recusada' as result;
