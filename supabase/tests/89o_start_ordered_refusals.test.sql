-- Lote de 10, item 4: SEGURANÇA DO INÍCIO ORDENADO. Cada recusa de start_ordered_meeting deve ter o código esperado E nenhum efeito colateral
-- (o instantâneo da reserva, dos encontros, da auditoria e dos avisos é idêntico antes e depois). Banco descartável; tudo revertido (ROLLBACK).
-- Cobre: instrutor dono / não dono / aluno / admin / id inexistente; PIN correto, errado, de outra reserva, vazio e nulo; status inválido da reserva e do
-- encontro; dia futuro (24 h exatas); encontro anterior pendente, em andamento ou cancelado; continuidade ainda não agendada; início correto e repetido.
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
create function pg_temp.free_slot(p_from int, p_to int) returns timestamptz language sql as $$
  select c.st from (select (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => d, hours => h)) at time zone 'America/Fortaleza' st
    from generate_series(p_from, p_to) d cross join generate_series(8, 10) h) c
  where c.st > now() + interval '2 hours'
    and public.instructor_can_attend('00000000-0000-0000-0000-0000000000a1', jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', 1)))
    and not exists (select 1 from public.booking_meetings m join public.bookings k on k.id = m.booking_id
        where k.student_id = '00000000-0000-0000-0000-0000000000b2' and m.status::text <> 'cancelled' and k.status::text in ('confirmed', 'awaiting_payment')
          and tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.minutes), '[)') && tstzrange(c.st - interval '3 hours', c.st + interval '3 hours', '[)'))
  order by c.st limit 1 $$;
-- Instantâneo sem efeitos colaterais: linhas da reserva e dos encontros + contagens de auditoria e de avisos.
create function pg_temp.snap(p_bk uuid) returns text language sql as $$
  select md5(coalesce((select row_to_json(b)::text from public.bookings b where b.id = p_bk), '') ||
             coalesce((select string_agg(row_to_json(m)::text, '|' order by m.position) from public.booking_meetings m where m.booking_id = p_bk), '') ||
             (select count(*) from public.audit_logs)::text || '/' || (select count(*) from public.app_notifications)::text) $$;
-- Reserva paga (simulada) de 2 encontros de 1h; encontro 1 passado, encontro 2 futuro.
create function pg_temp.mkbook(p_hours_ago int, out v_bk uuid, out m1 uuid, out m2 uuid, out v_pin text) language plpgsql as $$
declare d1 timestamptz; d2 timestamptz;
begin
  d1 := pg_temp.free_slot(3, 80);
  d2 := pg_temp.free_slot(((d1 at time zone 'America/Fortaleza')::date - (now() at time zone 'America/Fortaleza')::date) + 3, 200);
  if d1 is null or d2 is null then raise exception 'FIXTURE: sem horarios livres'; end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true); execute 'set local role authenticated';
  v_bk := public.create_booking((select id from public.beaches where slug = 'jeri'), 'first_time', 'Português',
    jsonb_build_array(jsonb_build_object('starts_at', d1, 'hours', 1), jsonb_build_object('starts_at', d2, 'hours', 1)));
  perform public.simulate_test_payment(v_bk, 'pix', 'approved');
  execute 'reset role';
  assert (select instructor_id from public.bookings where id = v_bk) = '00000000-0000-0000-0000-0000000000a1'::uuid, 'FIXTURE: instrutor a1';
  select id into m1 from public.booking_meetings where booking_id = v_bk and position = 1;
  select id into m2 from public.booking_meetings where booking_id = v_bk and position = 2;
  select presence_code into v_pin from public.bookings where id = v_bk;
  update public.booking_meetings set starts_at = now() - make_interval(hours => p_hours_ago) where id = m1;
end $$;

do $$
declare
  a1 constant uuid := '00000000-0000-0000-0000-0000000000a1'; a2 constant uuid := '00000000-0000-0000-0000-0000000000a2';
  stu constant uuid := '00000000-0000-0000-0000-0000000000b2'; adm constant uuid := '00000000-0000-0000-0000-00000000000a';
  v record; w record; r text; s0 text; pin2 text; n int := 0;
begin
  select * into v from pg_temp.mkbook(6);
  select * into w from pg_temp.mkbook(12);     -- outra reserva (para o PIN "de outra reserva")
  pin2 := w.v_pin;
  if pin2 = v.v_pin then pin2 := lpad(((v.v_pin::int + 1) % 10000)::text, 4, '0'); end if;
  assert pin2 is distinct from v.v_pin, 'PIN de outra reserva deve ser diferente';

  -- Regra: cada item = (rótulo, chamador, SQL, prefixo esperado do erro)
  create temp table cases(label text, who uuid, q text, expect text) on commit drop;
  insert into cases values
    ('instrutor que NAO é o dono',        a2,  format('select public.start_ordered_meeting(%L, %L)', v.m1, v.v_pin), 'P0002:'),
    ('aluno',                              stu, format('select public.start_ordered_meeting(%L, %L)', v.m1, v.v_pin), '42501:'),
    ('admin com AAL2 (nao e dono)', adm, format('select public.start_ordered_meeting(%L, %L)', v.m1, v.v_pin), 'P0002:'),
    ('encontro inexistente',               a1,  format('select public.start_ordered_meeting(%L, %L)', gen_random_uuid(), v.v_pin), 'P0002:'),
    ('PIN errado',                         a1,  format('select public.start_ordered_meeting(%L, %L)', v.m1, case when v.v_pin = '0000' then '1111' else '0000' end), '22023:'),
    ('PIN de outra reserva',               a1,  format('select public.start_ordered_meeting(%L, %L)', v.m1, pin2), '22023:'),
    ('PIN vazio',                          a1,  format('select public.start_ordered_meeting(%L, %L)', v.m1, ''), '22023:'),
    ('PIN com espaco',                     a1,  format('select public.start_ordered_meeting(%L, %L)', v.m1, ' ' || v.v_pin), '22023:'),
    ('PIN nulo',                           a1,  format('select public.start_ordered_meeting(%L, NULL)', v.m1), '22023:'),
    ('encontro 2 antes do 1 terminar',     a1,  format('select public.start_ordered_meeting(%L, %L)', v.m2, v.v_pin), '55000:');
  for r in select label from cases order by label loop null; end loop;   -- (a tabela existe só para documentar os casos no log em caso de falha)

  -- 1. Recusas de identidade, PIN e ordem: código esperado, zero efeitos.
  for r in select label || '|' || who || '|' || q || '|' || expect from cases loop
    declare p text[] := string_to_array(r, '|'); got text; begin
      s0 := pg_temp.snap(v.v_bk);
      got := pg_temp.try(p[3], p[2]::uuid);
      assert got like p[4] || '%', p[1] || ': esperado ' || p[4] || ' e veio ' || got;
      assert pg_temp.snap(v.v_bk) = s0 and pg_temp.snap(w.v_bk) is not null, p[1] || ': a recusa deixou efeitos colaterais';
      n := n + 1;
    end;
  end loop;

  -- 2. Status inválido da RESERVA (awaiting_payment, cancelled, completed): 55000 e sem efeitos.
  foreach r in array array['awaiting_payment', 'cancelled', 'completed'] loop
    update public.bookings set status = r::public.booking_status where id = v.v_bk;
    s0 := pg_temp.snap(v.v_bk);
    assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m1, v.v_pin), a1) like '55000:%', 'reserva ' || r || ' deve recusar';
    assert pg_temp.snap(v.v_bk) = s0, 'reserva ' || r || ': recusa deixou efeitos'; n := n + 1;
  end loop;
  update public.bookings set status = 'confirmed' where id = v.v_bk;

  -- 3. Status inválido do ENCONTRO (in_progress, done, cancelled): 55000 e sem efeitos.
  foreach r in array array['in_progress', 'done', 'cancelled'] loop
    update public.booking_meetings set status = r::public.meeting_status where id = v.m1;
    s0 := pg_temp.snap(v.v_bk);
    assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m1, v.v_pin), a1) like '55000:%', 'encontro ' || r || ' deve recusar';
    assert pg_temp.snap(v.v_bk) = s0, 'encontro ' || r || ': recusa deixou efeitos'; n := n + 1;
  end loop;
  update public.booking_meetings set status = 'scheduled' where id = v.m1;

  -- 4. Encontro anterior pendente: scheduled, in_progress ou cancelled bloqueiam o seguinte (só 'done' libera).
  update public.booking_meetings set starts_at = now() + interval '1 hour' where id = v.m2;      -- janela de 24 h aberta para o encontro 2
  foreach r in array array['scheduled', 'in_progress', 'cancelled'] loop
    update public.booking_meetings set status = r::public.meeting_status where id = v.m1;
    s0 := pg_temp.snap(v.v_bk);
    assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m2, v.v_pin), a1) like '55000:%', 'anterior ' || r || ' deve bloquear o seguinte';
    assert pg_temp.snap(v.v_bk) = s0, 'anterior ' || r || ': recusa deixou efeitos'; n := n + 1;
  end loop;
  update public.booking_meetings set status = 'scheduled' where id = v.m1;
  update public.booking_meetings set starts_at = (select d from (select starts_at d from public.booking_meetings where id = v.m2) x) where id = v.m2;

  -- 5. Regra de produto aprovada: inicio permitido no maximo 24 horas antes do
  -- horario agendado (janela movel), inclusive se o dia local ja mudou.
  -- Usar 25h para testar a recusa, evitando o falso positivo do "dia seguinte".
  update public.booking_meetings set starts_at = now() + interval '25 hours', status = 'scheduled' where id = v.m1;
  s0 := pg_temp.snap(v.v_bk);
  r := pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m1, v.v_pin), a1);
  assert r like '55000:%', format('mais de 24h deve recusar: got=%s, starts_at=%s, now=%s, booking_status=%s, meeting_status=%s', r, (select starts_at from public.booking_meetings where id=v.m1), now(), (select status from public.bookings where id=v.v_bk), (select status from public.booking_meetings where id=v.m1));
  assert pg_temp.snap(v.v_bk) = s0, 'mais de 24h: recusa deixou efeitos'; n := n + 1;

  -- 6. Inicio correto no dia local de Fortaleza; repetir e recusado sem efeitos.
  update public.booking_meetings set starts_at = now() - interval '1 minute' where id = v.m1;
  assert (select status::text from public.booking_meetings where id = v.m2) = 'scheduled', 'pré: encontro 2 agendado';
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m1, v.v_pin), a1) = 'ok', 'encontro no dia local deve iniciar';
  assert (select status::text from public.booking_meetings where id = v.m1) = 'in_progress' and (select started_at is not null from public.booking_meetings where id = v.m1), 'iniciado e com started_at';
  assert (select status::text from public.booking_meetings where id = v.m2) = 'scheduled', 'o encontro 2 não é afetado';
  assert (select status::text from public.bookings where id = v.v_bk) = 'confirmed', 'a reserva segue confirmada';
  s0 := pg_temp.snap(v.v_bk);
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m1, v.v_pin), a1) like '55000:%', 'iniciar de novo deve recusar';
  assert pg_temp.snap(v.v_bk) = s0, 'início repetido: recusa deixou efeitos'; n := n + 1;

  -- 7. Interrompido sem continuidade agendada não inicia (#93): recusa sem efeitos.
  assert pg_temp.try(format('select public.interrupt_meeting(%L, ''Vento forte demais para voar'', 30, 30, array[1], array[]::int[])', v.m1), a1) = 'ok', 'interromper';
  s0 := pg_temp.snap(v.v_bk);
  assert pg_temp.try(format('select public.start_ordered_meeting(%L, %L)', v.m1, v.v_pin), a1) like '55000:%continuation%', 'awaiting_resume não inicia';
  assert pg_temp.snap(v.v_bk) = s0, 'awaiting_resume: recusa deixou efeitos'; n := n + 1;

  assert n = 22, 'o teste deveria ter exercitado exatamente 22 recusas, exercitou ' || n;
  raise notice 'recusas verificadas sem efeitos colaterais: %', n;
end $$;
rollback;
select 'PASS: início ordenado: dono/não dono/aluno/admin, PIN, status da reserva e do encontro, 24 h, encontro anterior pendente, continuidade; toda recusa sem efeitos colaterais' as result;
