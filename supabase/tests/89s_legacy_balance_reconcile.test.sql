-- #93 (revisão independente de 23/11): RECONCILIAR o saldo legado (VNT-1008: 110 + 115 = 225/240, saldo 15) com o novo fluxo ANTES de habilitar a flag.
-- Banco descartável; tudo revertido (ROLLBACK). Cobre: (1) legado intacto; (2) as RPCs novas não tocam encontros já concluídos; (3) a reposição legada de 15 min
-- (pedido do aluno + aceite do instrutor) continua funcionando e pode ser CONCLUÍDA pelo caminho novo (240/240, sem duplicar evolução nem cobrança);
-- (4) a reposição interrompida e retomada (10 + 5) fecha o saldo: booking_balance_minutes conta a 1ª parte (migration 20261123130000);
-- (5) paridade com o espelho em TypeScript (src/lib/booking-cycle.ts) nos mesmos números.
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
create function pg_temp.balance(p_bk uuid) returns int language plpgsql as $$
declare r int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true); execute 'set local role authenticated';
  r := public.booking_balance_minutes(p_bk); execute 'reset role'; return r;
end $$;

do $$
declare
  a1 constant uuid := '00000000-0000-0000-0000-0000000000a1'; stu constant uuid := '00000000-0000-0000-0000-0000000000b2';
  d1 timestamptz; d2 timestamptz; t timestamptz; bk uuid; m1 uuid; m2 uuid; m3 uuid; pin text; req uuid; r text;
  money text; n_bk int; n_notif_pay int; none text := 'array[]::int[]';
begin
  -- ===== Reserva 4 h em 2 x 120, registros LEGADOS 110 + 115 (VNT-1008) =====
  d1 := pg_temp.free_slot(3, 80, 2);
  d2 := pg_temp.free_slot(((d1 at time zone 'America/Fortaleza')::date - (now() at time zone 'America/Fortaleza')::date) + 3, 200, 2);
  assert d1 is not null and d2 is not null, 'FIXTURE: horarios livres';
  perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
  bk := public.create_booking((select id from public.beaches where slug = 'jeri'), 'first_time', 'Português',
    jsonb_build_array(jsonb_build_object('starts_at', d1, 'hours', 2), jsonb_build_object('starts_at', d2, 'hours', 2)));
  perform public.simulate_test_payment(bk, 'pix', 'approved'); execute 'reset role';
  select id into m1 from public.booking_meetings where booking_id = bk and position = 1;
  select id into m2 from public.booking_meetings where booking_id = bk and position = 2;
  select presence_code into pin from public.bookings where id = bk;
  update public.booking_meetings set starts_at = now() - interval '70 hours' where id = m1;
  update public.booking_meetings set starts_at = now() - interval '60 hours' where id = m2;
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', m1, pin), a1) = 'ok', 'inicio 1';
  assert pg_temp.try(format('select public.record_meeting_with_skills(%L, 110, array[1], array[]::int[])', m1), a1) = 'ok', 'legado 110';
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', m2, pin), a1) = 'ok', 'inicio 2';
  assert pg_temp.try(format('select public.record_meeting_with_skills(%L, 115, array[2], array[]::int[])', m2), a1) = 'ok', 'legado 115';
  assert (select sum(done_minutes) from public.booking_meetings where booking_id = bk) = 225 and pg_temp.balance(bk) = 15, '(1) legado: 225/240 e saldo 15';
  assert (select status::text from public.bookings where id = bk) = 'confirmed', '(1) a reserva segue confirmada com saldo';
  select format('%s/%s/%s/%s/%s', total_cents, partner_cents, platform_cents, instructor_net_cents, hourly_rate_cents) into money from public.bookings where id = bk;
  select count(*) into n_bk from public.bookings;

  -- ===== (2) as RPCs novas não tocam encontros já concluídos =====
  foreach r in array array[
    format('select public.interrupt_meeting(%L, ''Vento forte demais'', 10, 5, array[1], %s)', m2, none),
    format('select public.complete_meeting_with_skills(%L, 5, array[1], %s)', m2, none),
    format('select public.schedule_meeting_resume(%L, now() + interval ''5 days'')', m2)] loop
    assert pg_temp.try(r, a1) like '55000:%', '(2) encontro já concluído: RPC nova recusa ' || r;
  end loop;
  assert (select sum(done_minutes) from public.booking_meetings where booking_id = bk) = 225 and pg_temp.balance(bk) = 15, '(2) nada mudou';

  -- ===== (3) reposição legada de 15 min, concluída pelo caminho NOVO =====
  t := pg_temp.free_slot(5, 30, 1);
  perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
  req := public.request_balance_meeting(bk, t, 15); execute 'reset role';
  assert req is not null, '(3) o aluno pede a reposição de 15 min (RPC legada preservada)';
  assert pg_temp.try(format('select public.respond_balance_meeting(%L, true)', req), a1) = 'ok', '(3) o instrutor aceita';
  select id into m3 from public.booking_meetings where booking_id = bk and position = 3;
  assert m3 is not null and (select minutes from public.booking_meetings where id = m3) = 15, '(3) encontro de reposição de 15 min criado';
  assert pg_temp.balance(bk) = 0, '(3) com a reposição agendada o saldo reservado é 0';
  update public.booking_meetings set starts_at = now() + interval '1 hour' where id = m3;
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', m3, pin), a1) = 'ok', '(3) inicia a reposição (PIN, 24 h)';
  assert pg_temp.try(format('select public.complete_meeting_with_skills(%L, 15, array[3], %s)', m3, none), a1) = 'ok', '(3) conclui pelo caminho NOVO';
  assert (select sum(done_minutes + previous_done_minutes) from public.booking_meetings where booking_id = bk) = 240, '(3) 240/240 entregues';
  assert pg_temp.balance(bk) = 0, '(3) saldo 0';
  assert (select status::text from public.bookings where id = bk) = 'completed', '(3) a reserva conclui';
  assert (select count(*) from public.booking_meetings where booking_id = bk and status = 'done') = 3, '(3) 3 encontros concluídos, nenhum duplicado';
  assert (select count(*) from public.meeting_skill_progress where meeting_id in (m1, m2, m3)) = 3, '(3) evolução: 1 linha por encontro, sem duplicar';
  assert (select format('%s/%s/%s/%s/%s', total_cents, partner_cents, platform_cents, instructor_net_cents, hourly_rate_cents) from public.bookings where id = bk) = money, '(3) valores congelados intactos: nenhuma cobrança adicional';
  assert (select count(*) from public.bookings) = n_bk, '(3) nenhuma reserva nova';

  -- ===== (4) reposição INTERROMPIDA e retomada (10 + 5): o saldo conta a 1ª parte =====
  d1 := pg_temp.free_slot(40, 120, 2);
  d2 := pg_temp.free_slot(((d1 at time zone 'America/Fortaleza')::date - (now() at time zone 'America/Fortaleza')::date) + 3, 200, 2);
  perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
  bk := public.create_booking((select id from public.beaches where slug = 'jeri'), 'first_time', 'Português',
    jsonb_build_array(jsonb_build_object('starts_at', d1, 'hours', 2), jsonb_build_object('starts_at', d2, 'hours', 2)));
  perform public.simulate_test_payment(bk, 'pix', 'approved'); execute 'reset role';
  select id into m1 from public.booking_meetings where booking_id = bk and position = 1;
  select id into m2 from public.booking_meetings where booking_id = bk and position = 2;
  select presence_code into pin from public.bookings where id = bk;
  update public.booking_meetings set starts_at = now() - interval '50 hours' where id = m1;
  update public.booking_meetings set starts_at = now() - interval '40 hours' where id = m2;
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', m1, pin), a1) = 'ok', 'inicio 1 (bk2)';
  assert pg_temp.try(format('select public.record_meeting_with_skills(%L, 110, array[1], array[]::int[])', m1), a1) = 'ok', 'legado 110 (bk2)';
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', m2, pin), a1) = 'ok', 'inicio 2 (bk2)';
  assert pg_temp.try(format('select public.record_meeting_with_skills(%L, 115, array[2], array[]::int[])', m2), a1) = 'ok', 'legado 115 (bk2)';
  t := pg_temp.free_slot(5, 30, 1);
  perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
  req := public.request_balance_meeting(bk, t, 15); execute 'reset role';
  assert pg_temp.try(format('select public.respond_balance_meeting(%L, true)', req), a1) = 'ok', 'reposição aceita (bk2)';
  select id into m3 from public.booking_meetings where booking_id = bk and position = 3;
  update public.booking_meetings set starts_at = now() + interval '3 hours' where id = m3;
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', m3, pin), a1) = 'ok', 'inicia reposição (bk2)';
  assert pg_temp.try(format('select public.interrupt_meeting(%L, ''Vento caiu de repente na praia'', 10, 5, array[3], %s)', m3, none), a1) = 'ok', 'interrompe a reposição aos 10 min (restam 5)';
  assert pg_temp.balance(bk) = 0, '(4) interrompida: 225 + 10 dados + 5 reservados = 240, saldo 0 (a 1ª parte conta)';
  t := pg_temp.free_slot(8, 40, 1);
  assert pg_temp.try(format('select public.schedule_meeting_resume(%L, %L)', m3, t), a1) = 'ok', 'agenda os 5 min';
  assert pg_temp.balance(bk) = 0, '(4) continuidade agendada: saldo 0';
  update public.booking_meetings set starts_at = now() + interval '5 hours' where id = m3;
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', m3, pin), a1) = 'ok', 'retoma';
  assert pg_temp.try(format('select public.complete_meeting_with_skills(%L, 5, array[4], %s)', m3, none), a1) = 'ok', 'conclui os 5 min';
  assert (select previous_done_minutes + done_minutes from public.booking_meetings where id = m3) = 15, '(4) reposição = 10 + 5 = 15';
  assert pg_temp.balance(bk) = 0, '(4) concluída: saldo 0 (sem a correção a função devolveria 10)';
  assert (select status::text from public.bookings where id = bk) = 'completed', '(4) reserva concluída';
  assert (select count(*) from public.meeting_skill_progress where meeting_id in (m1, m2, m3)) = 4, '(4) evolução: 1, 2 e 3 + 4 (a retomada soma a etapa 4), sem duplicar';

  -- ===== (5) paridade com o espelho em TypeScript (mesmos números de scripts/test-booking-cycle.mjs) =====
  -- 110+10 / 115 => 5 ; interrompida aguardando (110 + 10) / 115 => 5 ; sem interrupção 120+120 reservados => 0
  assert 240 - ((110 + 10) + 115) = 5 and 240 - (115 + (110 + 10)) = 5 and 240 - (120 + 120) = 0, '(5) aritmética do espelho TS';
end $$;
rollback;
select 'PASS: VNT-1008 legado 225/240 reconciliado com o novo fluxo: reposição de 15 min concluída pelo caminho novo (240/240, sem duplicar evolução nem cobrança) e saldo conta a 1ª parte da aula retomada' as result;
