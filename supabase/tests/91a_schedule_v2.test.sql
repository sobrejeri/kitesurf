-- #91 Módulo 2 (agenda v2): turnos por dia da semana, pausas, folga/férias/bloqueio, horário extra, integração com a RPC de reserva,
-- reconciliação com a fila, conflitos listados (nunca apagados) e barreira de sobreposição no banco. Descartável, tudo revertido.
\set ON_ERROR_STOP on
begin;
-- Isolate this disposable scenario from unrelated holds left by earlier rule fixtures.
-- This setup is rolled back; production calendar RPCs never perform this cancellation.
update public.bookings set status='cancelled',cancelled_at=now() where status='awaiting_payment';

create function pg_temp.try(q text, who uuid) returns text language plpgsql as $$
declare st text; msg text;
begin
  perform set_config('request.jwt.claim.sub', who::text, true);
  execute 'set local role authenticated';
  begin execute q; exception when others then get stacked diagnostics msg = message_text; st := sqlstate; end;
  execute 'reset role';
  return coalesce(st || ':' || msg, 'ok');
end $$;
create function pg_temp.loc(d date, hhmm text) returns timestamptz language sql as $$ select ((d + hhmm::time) at time zone 'America/Fortaleza') $$;
create function pg_temp.can(who uuid, st timestamptz, hours int) returns boolean language sql as $$
  select public.instructor_can_attend(who, jsonb_build_array(jsonb_build_object('starts_at', st, 'hours', hours))) $$;
create function pg_temp.bk(who uuid, beach uuid, st timestamptz, hours int) returns text language sql as $$
  select pg_temp.try(format('select public.create_booking(%L, ''first_time'', ''Português'', jsonb_build_array(jsonb_build_object(''starts_at'', %L::timestamptz, ''hours'', %s)))', beach, st, hours), who) $$;

do $$
declare
  a1 constant uuid := '00000000-0000-0000-0000-0000000000a1';
  a2 constant uuid := '00000000-0000-0000-0000-0000000000a2';
  b1 constant uuid := '00000000-0000-0000-0000-0000000000b1';
  b2 constant uuid := '00000000-0000-0000-0000-0000000000b2';
  v_jeri uuid; mon date; r text; v_id uuid; v_to uuid; res jsonb; n int;
begin
  select id into strict v_jeri from public.beaches where slug = 'jeri';
  select d into mon from (select ((now() at time zone 'America/Fortaleza')::date + g) d from generate_series(21, 150) g) x
   where extract(dow from d) = 1
     and not exists (select 1 from public.booking_meetings m join public.bookings k on k.id = m.booking_id
                      where k.instructor_id = a1 and m.status::text <> 'cancelled' and k.status::text in ('confirmed', 'awaiting_payment')
                        and m.starts_at between pg_temp.loc(d - 1, '00:00') and pg_temp.loc(d + 8, '00:00'))
   order by d limit 1;
  assert mon is not null, 'FIXTURE: sem segunda-feira livre';

  -- A) turnos DIFERENTES por dia + pausa de almoço (segunda 08-18 com pausa 12-13; terça 14-20; sem os demais dias)
  r := pg_temp.try($q$select public.save_my_weekly_schedule('[{"weekday":1,"opens":"08:00","closes":"18:00","breaks":[{"from":"12:00","to":"13:00"}]},{"weekday":2,"opens":"14:00","closes":"20:00"}]'::jsonb, 0)$q$, a1);
  assert r = 'ok', 'A: salvar turnos por dia: ' || r;
  assert (select count(*) from public.instructor_weekly_hours where instructor_id = a1) = 2, 'A: dois dias gravados';
  assert (select count(*) from public.instructor_weekly_breaks where instructor_id = a1) = 1, 'A: uma pausa gravada';
  assert pg_temp.can(a1, pg_temp.loc(mon, '09:00'), 2), 'A: segunda de manhã aceita';
  assert pg_temp.can(a1, pg_temp.loc(mon, '10:00'), 2), 'A: termina exatamente no início da pausa (12:00) e é aceito';
  assert not pg_temp.can(a1, pg_temp.loc(mon, '11:00'), 2), 'A: atravessa o início da pausa';
  assert not pg_temp.can(a1, pg_temp.loc(mon, '12:00'), 1), 'A: dentro da pausa';
  assert not pg_temp.can(a1, pg_temp.loc(mon, '12:30'), 1), 'A: dentro da pausa (meio)';
  assert pg_temp.can(a1, pg_temp.loc(mon, '13:00'), 2), 'A: começa exatamente no fim da pausa (13:00) e é aceito';
  assert not pg_temp.can(a1, pg_temp.loc(mon + 1, '10:00'), 1), 'A: terça de manhã fora do turno (14-20)';
  assert pg_temp.can(a1, pg_temp.loc(mon + 1, '14:00'), 2), 'A: terça à tarde aceita';
  assert not pg_temp.can(a1, pg_temp.loc(mon + 2, '10:00'), 1), 'A: quarta sem turno';

  -- A2) validações do salvamento (recusa sem alterar nada)
  foreach r in array array[
    $q$select public.save_my_weekly_schedule('[{"weekday":1,"opens":"08:00","closes":"18:00"},{"weekday":1,"opens":"09:00","closes":"10:00"}]'::jsonb, 0)$q$,
    $q$select public.save_my_weekly_schedule('[{"weekday":1,"opens":"08:00","closes":"18:00","breaks":[{"from":"07:00","to":"09:00"}]}]'::jsonb, 0)$q$,
    $q$select public.save_my_weekly_schedule('[{"weekday":1,"opens":"08:00","closes":"18:00","breaks":[{"from":"10:00","to":"12:00"},{"from":"11:00","to":"13:00"}]}]'::jsonb, 0)$q$,
    $q$select public.save_my_weekly_schedule('[{"weekday":1,"opens":"18:00","closes":"08:00"}]'::jsonb, 0)$q$,
    $q$select public.save_my_weekly_schedule('[{"weekday":7,"opens":"08:00","closes":"18:00"}]'::jsonb, 0)$q$,
    $q$select public.save_my_weekly_schedule('[{"weekday":1,"opens":"08:00","closes":"18:00","price_cents":1}]'::jsonb, 0)$q$,
    $q$select public.save_my_weekly_schedule('[{"weekday":1,"opens":"08:00","closes":"18:00"}]'::jsonb, 121)$q$,
    $q$select public.save_my_weekly_schedule('{"weekday":1}'::jsonb, 0)$q$]
  loop
    declare x text := pg_temp.try(r, a1);
    begin assert x like '22%' or x like '22023:%', 'A2: deveria recusar (22023): ' || r || ' -> ' || x; end;
  end loop;
  assert (select count(*) from public.instructor_weekly_hours where instructor_id = a1) = 2
     and (select count(*) from public.instructor_weekly_breaks where instructor_id = a1) = 1, 'A2: recusa não altera a agenda salva';

  -- A3) permissões e titularidade
  assert pg_temp.try($q$select public.save_my_weekly_schedule('[]'::jsonb, 0)$q$, b1) like '42501:%', 'A3: aluno não salva agenda de instrutor';
  assert pg_temp.try($q$select public.add_my_time_off(now() + interval '2 days', now() + interval '3 days', 'block', '')$q$, b1) like '42501:%', 'A3: aluno não bloqueia horário';
  assert not has_function_privilege('anon', 'public.save_my_weekly_schedule(jsonb,integer)', 'EXECUTE')
     and not has_function_privilege('anon', 'public.add_my_time_off(timestamptz,timestamptz,text,text)', 'EXECUTE')
     and not has_function_privilege('anon', 'public.add_my_extra_hours(date,time,time)', 'EXECUTE')
     and not has_function_privilege('anon', 'public.list_my_schedule_conflicts()', 'EXECUTE'), 'A3: anon sem EXECUTE';
  assert not has_function_privilege('authenticated', 'public.instructor_slot_open(uuid,timestamptz,timestamptz)', 'EXECUTE')
     and not has_function_privilege('authenticated', 'public.reconcile_instructor_availability(uuid)', 'EXECUTE')
     and not has_function_privilege('authenticated', 'public.assert_instructor_slot_free(uuid,uuid,timestamptz,integer)', 'EXECUTE')
     and not has_function_privilege('authenticated', 'public.instructor_can_attend(uuid,jsonb)', 'EXECUTE')
     and not has_function_privilege('authenticated', 'public.can_move_meeting(uuid,uuid,timestamptz,integer)', 'EXECUTE'), 'A3: auxiliares fechadas à API';
  -- a2 não enxerga nem remove nada de a1
  perform pg_temp.try('select 1', a1);
  perform public.add_my_time_off((pg_temp.loc(mon + 30, '00:00')), pg_temp.loc(mon + 31, '00:00'), 'day_off', 'x')
    where false;
  set local role authenticated; perform set_config('request.jwt.claim.sub', a1::text, true);
  v_to := public.add_my_time_off(pg_temp.loc(mon + 30, '00:00'), pg_temp.loc(mon + 31, '00:00'), 'day_off', 'folga');
  reset role;
  assert (select kind from public.instructor_time_off where id = v_to) = 'day_off', 'A3: tipo folga gravado';
  assert pg_temp.try(format('select public.unblock_my_time(%L)', v_to), a2) like 'P0002:%', 'A3: outro instrutor não remove meu bloqueio';
  set local role authenticated; perform set_config('request.jwt.claim.sub', a2::text, true);
  assert (select count(*) from public.instructor_time_off where instructor_id = a1) = 0, 'A3: RLS esconde bloqueios de outro instrutor';
  reset role;
  assert pg_temp.try(format('select public.unblock_my_time(%L)', v_to), a1) = 'ok', 'A3: dono remove o próprio bloqueio';

  -- B) folga, férias, bloqueio: tipos, limites e semiaberto
  assert pg_temp.try(format('select public.add_my_time_off(%L, %L, ''vacation'', ''ferias'')', pg_temp.loc(mon + 60, '00:00'), pg_temp.loc(mon + 150, '00:00')), a1) = 'ok', 'B: férias de 90 dias aceitas';
  assert pg_temp.try(format('select public.add_my_time_off(%L, %L, ''vacation'', '''')', pg_temp.loc(mon + 200, '00:00'), pg_temp.loc(mon + 400, '00:00')), a1) like '22023:%', 'B: mais de 180 dias recusado';
  assert pg_temp.try(format('select public.add_my_time_off(%L, %L, ''block'', '''')', pg_temp.loc(mon + 1, '00:00'), pg_temp.loc(mon + 50, '00:00')), a1) like '22023:%', 'B: bloqueio avulso acima de 30 dias recusado';
  assert pg_temp.try(format('select public.add_my_time_off(%L, %L, ''xx'', '''')', pg_temp.loc(mon + 1, '00:00'), pg_temp.loc(mon + 2, '00:00')), a1) like '22023:%', 'B: tipo inválido recusado';
  assert pg_temp.try(format('select public.add_my_time_off(%L, %L, null, '''')', pg_temp.loc(mon + 1, '00:00'), pg_temp.loc(mon + 2, '00:00')), a1) like '22023:Invalid block%', 'B: tipo NULL recusado explicitamente (22023)';
  assert pg_temp.try(format('select public.add_my_time_off(%L, %L, ''day_off'', '''')', pg_temp.loc(mon + 1, '09:00'), pg_temp.loc(mon + 1, '10:00')), a1) like '22023:%', 'B: folga de 1 hora recusada (dia inteiro local)';
  assert pg_temp.try(format('select public.add_my_time_off(%L, %L, ''day_off'', '''')', pg_temp.loc(mon + 1, '00:00'), pg_temp.loc(mon + 1, '23:00')), a1) like '22023:%', 'B: folga que termina às 23h recusada (fim parcial)';
  assert pg_temp.try(format('select public.add_my_time_off(%L, %L, ''vacation'', '''')', pg_temp.loc(mon + 1, '08:00'), pg_temp.loc(mon + 3, '00:00')), a1) like '22023:%', 'B: férias que começam às 8h recusadas (início parcial)';
  assert pg_temp.try(format('select public.add_my_time_off(%L, %L, ''block'', '''')', pg_temp.loc(mon + 1, '09:00'), pg_temp.loc(mon + 1, '10:00')), a1) = 'ok', 'B: bloqueio avulso de 1 hora continua permitido';
  delete from public.instructor_time_off where instructor_id = a1 and starts_at = pg_temp.loc(mon + 1, '09:00');
  assert pg_temp.try(format('select public.add_my_time_off(%L, %L, ''block'', '''')', now() - interval '3 days', now() - interval '2 days'), a1) like '22023:%', 'B: período passado recusado';
  assert not pg_temp.can(a1, pg_temp.loc(mon + 61, '15:00'), 1), 'B: dentro das férias, recusado';
  assert pg_temp.try(format('select public.save_my_weekly_schedule(%L::jsonb, 0)', '[{"weekday":1,"opens":"08:00","closes":"18:00","breaks":[{"from":"12:00","to":"13:00"}]},{"weekday":2,"opens":"14:00","closes":"20:00"}]'), a1) = 'ok', 'B: salvar de novo mantém férias';
  assert (select count(*) from public.instructor_time_off where instructor_id = a1 and kind = 'vacation') = 1, 'B: salvar turnos não apaga férias';

  -- C) horário extra numa data fora do turno (quarta), respeitando folga/férias
  assert pg_temp.try(format('select public.add_my_extra_hours(%L, ''09:00'', ''12:00'')', mon + 2), a1) = 'ok', 'C: horário extra gravado';
  assert pg_temp.can(a1, pg_temp.loc(mon + 2, '09:00'), 3), 'C: quarta 09-12 aceita pelo horário extra';
  assert not pg_temp.can(a1, pg_temp.loc(mon + 2, '11:00'), 2), 'C: passa do horário extra';
  assert not pg_temp.can(a1, pg_temp.loc(mon + 9, '09:00'), 1), 'C: o extra vale só na data';
  assert pg_temp.try(format('select public.add_my_extra_hours(%L, ''12:00'', ''09:00'')', mon + 2), a1) like '22023:%', 'C: extra invertido recusado';
  assert pg_temp.try(format('select public.add_my_extra_hours(%L, ''09:00'', ''12:00'')', (now() at time zone 'America/Fortaleza')::date - 1), a1) like '22023:%', 'C: extra no passado recusado';
  assert pg_temp.try(format('select public.remove_my_extra_hours(%L)', (select id from public.instructor_extra_hours where instructor_id = a1)), a2) like 'P0002:%', 'C: outro instrutor não remove meu extra';

  -- D) RPC de reserva aplica a mesma regra (turno por dia, pausa, férias) e criação de reserva de 2h e de 4h em dois dias
  assert pg_temp.bk(b1, v_jeri, pg_temp.loc(mon, '12:00'), 1) like 'P0001:%No instructor available%', 'D: pausa recusada pela RPC';
  assert pg_temp.bk(b1, v_jeri, pg_temp.loc(mon + 1, '09:00'), 1) like 'P0001:%No instructor available%', 'D: fora do turno da terça recusado pela RPC';
  assert pg_temp.bk(b1, v_jeri, pg_temp.loc(mon + 61, '15:00'), 1) like 'P0001:%No instructor available%', 'D: férias recusadas pela RPC';
  assert pg_temp.bk(b1, v_jeri, pg_temp.loc(mon, '09:00'), 2) = 'ok', 'D: 2h no turno aceita';
  select count(*) into n from public.bookings where student_id = b1 and instructor_id = a1;
  assert n >= 1, 'D: reserva criada para a1';
  -- 4h em dois dias, um em cada turno (segunda 14:00 e terça 14:00) numa única reserva: validada em conjunto
  set local role authenticated; perform set_config('request.jwt.claim.sub', b2::text, true);
  v_id := public.create_booking(v_jeri, 'first_time', 'Português', jsonb_build_array(
    jsonb_build_object('starts_at', pg_temp.loc(mon, '14:00'), 'hours', 2), jsonb_build_object('starts_at', pg_temp.loc(mon + 1, '14:00'), 'hours', 2)));
  reset role;
  assert (select count(*) from public.booking_meetings where booking_id = v_id) = 2 and (select sum(minutes) from public.booking_meetings where booking_id = v_id) = 240, 'D: 4h em dois dias criada';
  -- um encontro fora do turno invalida a reserva INTEIRA e não deixa nada
  select count(*) into n from public.bookings;
  assert pg_temp.try(format('select public.create_booking(%L, ''first_time'', ''Português'', %L::jsonb)', v_jeri,
    jsonb_build_array(jsonb_build_object('starts_at', pg_temp.loc(mon + 8, '14:00'), 'hours', 2), jsonb_build_object('starts_at', pg_temp.loc(mon + 9, '07:00'), 'hours', 2))), b1) like 'P0001:%', 'D: multi-encontro com um fora do turno recusado';
  assert (select count(*) from public.bookings) = n, 'D: nada persistido na recusa';

  -- E) conflitos: confirmar a reserva de 4h e depois estreitar o turno. A aula confirmada NÃO é apagada nem movida, só listada
  perform pg_temp.try(format('select public.confirm_test_payment(%L)', v_id), b2);
  assert (select status::text from public.bookings where id = v_id) = 'confirmed', 'E: reserva confirmada (pagamento de teste)';
  r := pg_temp.try($q$select public.save_my_weekly_schedule('[{"weekday":1,"opens":"08:00","closes":"12:00"}]'::jsonb, 0)$q$, a1);
  assert r = 'ok', 'E: estreitar turno: ' || r;
  set local role authenticated; perform set_config('request.jwt.claim.sub', a1::text, true);
  select count(*) into n from public.list_my_schedule_conflicts() c where c.booking_code = (select code from public.bookings where id = v_id);
  reset role;
  assert n = 2, 'E: as duas aulas (seg 14h e ter 14h) ficaram fora do novo turno e são listadas: ' || n;
  assert (select status::text from public.bookings where id = v_id) = 'confirmed'
     and (select count(*) from public.booking_meetings where booking_id = v_id and status::text = 'scheduled') = 2, 'E: aulas confirmadas intactas';
  set local role authenticated; perform set_config('request.jwt.claim.sub', b1::text, true);
  assert (select count(*) from public.bookings where id = v_id) = 0, 'E: aluno de outra reserva não vê';
  reset role;
  res := (select public.reconcile_instructor_availability(a1));
  assert (res->>'conflicting_meetings')::int >= 2, 'E: reconciliação conta os conflitos';

  -- F) bloqueio não pode cobrir aula confirmada nem reserva em pagamento
  assert pg_temp.try(format('select public.add_my_time_off(%L, %L, ''block'', '''')', pg_temp.loc(mon, '13:00'), pg_temp.loc(mon, '17:00')), a1) like '55000:A confirmed class%', 'F: bloqueio sobre aula confirmada recusado';
  perform pg_temp.try($q$select public.save_my_weekly_schedule('[{"weekday":1,"opens":"08:00","closes":"23:00"},{"weekday":2,"opens":"08:00","closes":"23:00"}]'::jsonb, 0)$q$, a1);
  assert pg_temp.bk(b1, v_jeri, pg_temp.loc(mon + 8, '16:00'), 1) = 'ok', 'F: reserva em pagamento criada';
  assert pg_temp.try(format('select public.add_my_time_off(%L, %L, ''block'', '''')', pg_temp.loc(mon + 8, '15:00'), pg_temp.loc(mon + 8, '18:00')), a1) like '55000:A pending reservation%', 'F: bloqueio sobre reserva em pagamento recusado';

  -- H) reduzir a agenda sobre a retenção ativa é recusado e conserva reserva/agenda.
  declare hold uuid; schedule_before jsonb; hold_before jsonb; fn text; q text;
  begin
    select b.id into strict hold from public.bookings b join public.booking_meetings m on m.booking_id=b.id
     where b.student_id=b1 and b.instructor_id=a1 and b.status='awaiting_payment' and m.starts_at=pg_temp.loc(mon+8,'16:00');
    select jsonb_agg(to_jsonb(h) order by weekday) into schedule_before from public.instructor_weekly_hours h where instructor_id=a1;
    select to_jsonb(b) into hold_before from public.bookings b where id=hold;
    foreach q in array array[
      $q$select public.save_my_weekly_schedule('[{"weekday":1,"opens":"08:00","closes":"23:00"}]'::jsonb,0)$q$,
      $q$select public.save_my_schedule(array[1],time '08:00',time '23:00',0)$q$
    ] loop
      r:=pg_temp.try(q,a1);
      assert r like '55000:A pending reservation%', 'H: redução sobre reserva pendente deve ser recusada: '||r;
      assert (select to_jsonb(b) from public.bookings b where id=hold)=hold_before,'H: snapshot da reserva preservado';
    end loop;
    assert (select jsonb_agg(to_jsonb(h) order by weekday) from public.instructor_weekly_hours h where instructor_id=a1)=schedule_before,
      'H: agenda preservada após recusa';
    assert (select status::text from public.bookings where id=hold)='awaiting_payment', 'H: reserva não pode ser cancelada';
    assert not exists(select 1 from public.audit_logs where action='booking.hold_cancelled_availability' and entity_id=hold::text),
      'H: nenhuma auditoria de cancelamento automático';
    foreach fn in array array['confirm_test_payment','confirm_validation_lesson'] loop
      begin
        assert pg_temp.try(format('select public.%I(%L)',fn,hold),b1)='ok', 'H: confirmação deve continuar disponível';
        assert (select status::text from public.bookings where id=hold)='confirmed','H: reserva confirmada após edição recusada';
        raise sqlstate 'ZT091'; -- keep the pending fixture for the overlap checks below
      exception when sqlstate 'ZT091' then null; end;
    end loop;
    assert (select status::text from public.bookings where id=v_id)='confirmed', 'H: reserva confirmada anterior intacta';
  end;

  -- I) reagendamento usa a MESMA regra: can_move_meeting (função interna) respeita turno, dia fechado, férias e ignora o próprio encontro
  declare own uuid; v_ok boolean;
  begin
    select m.id into strict own from public.booking_meetings m where m.booking_id = v_id and m.position = 1;
    assert public.can_move_meeting(a1, own, pg_temp.loc(mon, '14:00'), 120), 'I: mover o encontro para o próprio horário é aceito (ignora a si mesmo)';
    assert public.can_move_meeting(a1, gen_random_uuid(), pg_temp.loc(mon, '19:00'), 60), 'I: segunda 19:00 está dentro do turno e livre';
    assert not public.can_move_meeting(a1, gen_random_uuid(), pg_temp.loc(mon, '14:00'), 60), 'I: horário de outro encontro confirmado é recusado';
    assert not public.can_move_meeting(a1, own, pg_temp.loc(mon + 2, '15:00'), 120), 'I: quarta à tarde está fora da agenda e do horário extra';
    assert not public.can_move_meeting(a1, own, pg_temp.loc(mon + 61, '10:00'), 60), 'I: férias bloqueiam o reagendamento';
  end;

  -- G) barreira do banco: dois encontros ativos do mesmo instrutor não se sobrepõem, nem por inserção direta, nem por troca de instrutor
  declare vb uuid; vm uuid; other_b uuid; begin
    select b.id into other_b from public.bookings b where b.id = v_id;
    begin
      insert into public.booking_meetings (booking_id, position, starts_at, minutes)
        values (v_id, 9, (select starts_at from public.booking_meetings where booking_id = v_id and position = 1) + interval '30 minutes', 60);
      raise exception 'G: sobreposição direta aceita';
    exception when sqlstate '23P01' then null; end;
    -- mover um encontro ativo de a1 para cima de outro encontro confirmado de a1 é recusado (caminho UPDATE)
    select b.id, m.id into vb, vm from public.bookings b join public.booking_meetings m on m.booking_id = b.id
      where b.instructor_id = a1 and b.status::text = 'awaiting_payment' and b.created_at >= now() - interval '10 minutes' and m.status::text <> 'cancelled' limit 1;
    assert vm is not null, 'G: fixture sem reserva em pagamento de a1';
    begin
      update public.booking_meetings set starts_at = (select starts_at from public.booking_meetings where booking_id = v_id and position = 1) where id = vm;
      raise exception 'G: movimento para horário ocupado aceito';
    exception when sqlstate '23P01' then null; end;
    -- troca de instrutor (caminho UPDATE em bookings): reserva de outro instrutor, no horário ocupado de a1, não pode ir para a1
    declare v_prea uuid; v_pb uuid; v_slot timestamptz;
    begin
      select id into strict v_prea from public.beaches where slug = 'prea';
      select starts_at into v_slot from public.booking_meetings where booking_id = v_id and position = 1;
      assert pg_temp.bk(b1, v_prea, v_slot, 1) = 'ok', 'G: reserva de outro instrutor no mesmo horário criada';
      select b.id into strict v_pb from public.bookings b join public.booking_meetings m on m.booking_id = b.id
        where b.student_id = b1 and b.beach_id = v_prea and m.starts_at = v_slot and b.status::text = 'awaiting_payment';
      assert (select instructor_id from public.bookings where id = v_pb) <> a1, 'G: a reserva da praia deve ser de outro instrutor';
      begin
        update public.bookings set instructor_id = a1 where id = v_pb;
        raise exception 'G: troca de instrutor para horário ocupado aceita';
      exception when sqlstate '23P01' then null; end;
      assert (select instructor_id from public.bookings where id = v_pb) <> a1, 'G: troca recusada não altera a reserva';
    end;
  end;
  assert (select count(*) from public.booking_meetings where booking_id = v_id) = 2, 'G: nada foi inserido';
end $$;
rollback;
select 'PASS: agenda v2: turnos por dia, pausas, folga/férias/bloqueio, horário extra, RPC de reserva, multi-encontro, conflitos listados sem apagar, permissões e barreira de sobreposição' as result;
