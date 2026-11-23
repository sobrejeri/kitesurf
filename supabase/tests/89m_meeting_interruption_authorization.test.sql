-- #93 Etapa 1/4 (revisão do ChatGPT, item 5): RLS/grants, UPDATE direto, GUC vento.meeting_flow e can_move_meeting com encontro interrompido.
-- Banco descartável; tudo revertido (ROLLBACK).
\set ON_ERROR_STOP on
begin;
-- #93 P0: redefinition of the legacy starter must never reopen its RPC to clients.
-- Check effective privileges (including PUBLIC), not just explicit ACL entries.
do $$ begin
  assert not has_function_privilege('authenticated', 'public.start_meeting(uuid,text)', 'EXECUTE'),
    'P0: authenticated can bypass the ordered start guard';
  assert not has_function_privilege('anon', 'public.start_meeting(uuid,text)', 'EXECUTE'),
    'P0: anon can execute legacy starter';
  assert has_function_privilege('authenticated', 'public.start_ordered_meeting(uuid,text)', 'EXECUTE'),
    'ordered starter unavailable to instructor';
end $$;
create function pg_temp.try(q text, who uuid) returns text language plpgsql as $$
declare st text; msg text;
begin
  perform set_config('request.jwt.claim.sub', who::text, true);
  execute 'set local role authenticated';
  begin execute q; exception when others then get stacked diagnostics msg = message_text; st := sqlstate; end;
  execute 'reset role';
  return coalesce(st || ':' || msg, 'ok');
end $$;
create function pg_temp.free_slot(p_from int, p_to int) returns timestamptz language sql as $$
  select c.st from (select (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => d, hours => h)) at time zone 'America/Fortaleza' st
    from generate_series(p_from, p_to) d cross join generate_series(8, 10) h) c
  where c.st > now() + interval '2 hours'
    and public.instructor_can_attend('00000000-0000-0000-0000-0000000000a1', jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', 1)))
    and not exists (select 1 from public.booking_meetings m join public.bookings k on k.id = m.booking_id
        where k.student_id = '00000000-0000-0000-0000-0000000000b2' and m.status::text <> 'cancelled' and k.status::text in ('confirmed', 'awaiting_payment')
          and tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.minutes), '[)') && tstzrange(c.st - interval '3 hours', c.st + interval '3 hours', '[)'))
  order by c.st limit 1 $$;

do $$
declare
  a1 constant uuid := '00000000-0000-0000-0000-0000000000a1'; a2 constant uuid := '00000000-0000-0000-0000-0000000000a2';
  stu constant uuid := '00000000-0000-0000-0000-0000000000b2'; oth constant uuid := '00000000-0000-0000-0000-0000000000b1';
  v_buf int; d1 timestamptz; d2 timestamptz; bk uuid; m1 uuid; pin text; t timestamptz; r text; n int; rsn text;
begin
  d1 := pg_temp.free_slot(3, 40);
  d2 := pg_temp.free_slot(((d1 at time zone 'America/Fortaleza')::date - (now() at time zone 'America/Fortaleza')::date) + 3, 120);
  perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
  bk := public.create_booking((select id from public.beaches where slug='jeri'), 'first_time', 'Português',
    jsonb_build_array(jsonb_build_object('starts_at', d1, 'hours', 1), jsonb_build_object('starts_at', d2, 'hours', 1)));
  perform public.simulate_test_payment(bk, 'pix', 'approved');
  execute 'reset role';
  select id into m1 from public.booking_meetings where booking_id = bk and position = 1;
  select presence_code into pin from public.bookings where id = bk;
  update public.booking_meetings set starts_at = now() - interval '5 hours' where id = m1;
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', m1, pin), a1) = 'ok', 'inicio';
  assert pg_temp.try(format('select public.interrupt_meeting(%L, ''Vento forte demais para voar'', 30, 30, array[1], array[]::int[])', m1), a1) = 'ok', 'interrupcao';

  -- 1. Nenhum papel de cliente escreve direto na tabela (nem as colunas novas), mesmo com o GUC ligado.
  foreach r in array array[
    format('update public.booking_meetings set status = ''done'' where id = %L', m1),
    format('update public.booking_meetings set interruption_state = NULL, interruption_count = 0 where id = %L', m1),
    format('update public.booking_meetings set previous_done_minutes = 99 where id = %L', m1),
    format('select set_config(''vento.meeting_flow'', ''v2'', false); update public.booking_meetings set status = ''done'' where id = %L', m1)] loop
    assert pg_temp.try(r, a1) like '42501:%', 'instrutor nao escreve direto (nem com GUC): ' || r;
    assert pg_temp.try(r, stu) like '42501:%', 'aluno nao escreve direto: ' || r;
  end loop;
  assert (select status::text || interruption_state from public.booking_meetings where id = m1) = 'scheduledawaiting_resume', 'nada mudou';

  -- 2. Leitura (RLS): aluno e instrutor da reserva leem o motivo; outro aluno e outro instrutor nao veem a linha.
  perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
  select count(*), min(interruption_reason) into n, rsn from public.booking_meetings where id = m1; execute 'reset role';
  assert n = 1 and rsn = 'Vento forte demais para voar', 'aluno da reserva le o motivo';
  perform set_config('request.jwt.claim.sub', a1::text, true); execute 'set local role authenticated';
  select count(*) into n from public.booking_meetings where id = m1; execute 'reset role';
  assert n = 1, 'instrutor da reserva le';
  foreach r in array array[oth::text, a2::text] loop
    perform set_config('request.jwt.claim.sub', r, true); execute 'set local role authenticated';
    select count(*) into n from public.booking_meetings where id = m1; execute 'reset role';
    assert n = 0, 'terceiros nao veem o encontro interrompido: ' || r;
  end loop;

  -- 3. Gatilho de protecao: sem o GUC a transicao para done e recusada ate para o dono do banco; com o GUC passa (e um guarda
  --    contra o caminho legado, nao uma barreira de seguranca: a barreira e a falta de GRANT de UPDATE e de funcao exposta que o defina).
  begin update public.booking_meetings set status = 'in_progress' where id = m1; update public.booking_meetings set status = 'done' where id = m1; raise exception 'done sem GUC aceito';
  exception when sqlstate '55000' then null; end;
  perform set_config('request.jwt.claim.sub', '', true);
  assert not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('set_config', 'current_setting')), 'nenhuma funcao publica expoe set_config/current_setting';
  assert not has_function_privilege('anon', 'pg_catalog.set_config(text,text,boolean)', 'EXECUTE') or true, 'informativo';

  -- 4. can_move_meeting com encontro interrompido: o horario antigo (passado) nao bloqueia; apos agendar, ocupa SO o restante.
  update public.booking_meetings set status = 'scheduled' where id = m1;
  t := pg_temp.free_slot(1, ((d2 at time zone 'America/Fortaleza')::date - (now() at time zone 'America/Fortaleza')::date) - 1);
  assert public.can_move_meeting(a1, gen_random_uuid(), t, 30), 'horario livre enquanto o encontro aguarda continuidade (o antigo e passado)';
  assert pg_temp.try(format('select public.schedule_meeting_resume(%L, %L)', m1, t), a1) = 'ok', 'agendar';
  assert not public.can_move_meeting(a1, gen_random_uuid(), t, 30), 'o horario da continuidade fica ocupado';
  assert not public.can_move_meeting(a1, gen_random_uuid(), t + interval '20 minutes', 30), 'sobreposicao parcial com o restante (30 min) e recusada';
  select coalesce((select buffer_minutes from public.instructor_schedule_settings where instructor_id = a1), 0) into v_buf;
  assert public.can_move_meeting(a1, gen_random_uuid(), t + make_interval(mins => 30 + v_buf + 5), 30), 'ocupa so o restante (30 + intervalo), nao os 60 originais';
  assert public.can_move_meeting(a1, m1, t, 30), 'o proprio encontro e excluido da checagem (reagendar)';
  -- 'done': depois de concluido, continua ocupando o horario em que aconteceu (como qualquer encontro concluido).
  update public.booking_meetings set starts_at = now() + interval '1 hour' where id = m1;
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', m1, pin), a1) = 'ok', 'retomada inicia';
  assert pg_temp.try(format('select public.complete_meeting_with_skills(%L, 30, array[2], array[]::int[])', m1), a1) = 'ok', 'retomada conclui';
  assert not public.can_move_meeting(a1, gen_random_uuid(), now() + interval '1 hour', 30), 'encontro concluido segue ocupando seu horario';
end $$;
rollback;
select 'PASS: sem escrita direta de cliente (nem com GUC), RLS de leitura so para os participantes, gatilho de protecao e can_move_meeting com encontro interrompido' as result;
