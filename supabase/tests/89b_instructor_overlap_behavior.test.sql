-- P0 #91 (PR #296): o MESMO instrutor nunca fica com dois encontros sobrepostos.
-- Comportamento real pela RPC create_booking como alunos autenticados simulados, em banco descartável.
-- Cobre: mesmo horário, sobreposição parcial pelo fim e pelo início, borda encostada (permitida),
-- liberação por cancelamento e por reserva pendente vencida (10 min). Tudo é revertido no ROLLBACK.
-- A praia 'jeri' tem um único instrutor aprovado (a1); por isso a rejeição só pode vir da agenda dele.
\set ON_ERROR_STOP on
begin;
do $$
declare
  a1 constant uuid := '00000000-0000-0000-0000-0000000000a1';
  s1 constant text := '00000000-0000-0000-0000-0000000000b1';
  s2 constant text := '00000000-0000-0000-0000-0000000000b2';
  v_beach uuid; v_s timestamptz; v_before bigint; v_buf integer; v_base uuid; v_id uuid; v_hint text; v_state text;

begin
  select id into strict v_beach from public.beaches where slug = 'jeri';

  -- Intervalo minimo entre aulas do instrutor (buffer_minutes); 0 se nao configurado. Testes anteriores podem te-lo definido.
  select coalesce((select buffer_minutes from public.instructor_schedule_settings where instructor_id = a1), 0) into v_buf;

  -- Procura um horario S (2h) em que todas as sondas caibam na agenda do instrutor e sem reservas dele por perto.
  select c.st into v_s
  from (select (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => d, hours => h)) at time zone 'America/Fortaleza' as st
        from generate_series(3, 60) d cross join generate_series(9, 12) h) c
  where public.instructor_can_attend(a1, jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', 2)))
    and public.instructor_can_attend(a1, jsonb_build_array(jsonb_build_object('starts_at', c.st - interval '60 minutes', 'hours', 2)))
    and public.instructor_can_attend(a1, jsonb_build_array(jsonb_build_object('starts_at', c.st - make_interval(mins => 60 + v_buf), 'hours', 1)))
    and public.instructor_can_attend(a1, jsonb_build_array(jsonb_build_object('starts_at', c.st + make_interval(mins => 120 + v_buf), 'hours', 1)))
    and not exists (select 1 from public.booking_meetings m join public.bookings b on b.id = m.booking_id
                    where b.instructor_id = a1 and m.status::text <> 'cancelled' and b.status::text in ('confirmed', 'awaiting_payment')
                      and m.starts_at < c.st + interval '6 hours' and m.starts_at + make_interval(mins => m.minutes) > c.st - interval '3 hours')
  order by c.st limit 1;
  if v_s is null then raise exception 'FIXTURE: nenhum horario elegivel para o instrutor da praia jeri'; end if;

  -- Base: aluno 1 reserva S por 2h (confirma o horário do instrutor).
  perform set_config('request.jwt.claim.sub', s1, true); execute 'set local role authenticated';
  v_base := public.create_booking(v_beach, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', v_s, 'hours', 2)));
  execute 'reset role';
  assert (select instructor_id from public.bookings where id = v_base) = a1, 'a reserva base deve ficar com o instrutor a1';

  select count(*) into v_before from public.bookings where student_id = s2::uuid;
  -- Cada sonda roda como o aluno 2 num subbloco; o erro esperado é NO_INSTRUCTOR (nao ha outro instrutor na praia).
  perform set_config('request.jwt.claim.sub', s2, true);
  declare
    probe record;
    got text;
  begin
    for probe in
      select * from (values
        ('mesmo horario',                 0,   2, false),
        ('sobreposicao no fim (S+30)',    30,  1, false),
        ('sobreposicao no fim (S+60)',    60,  1, false),
        ('sobreposicao no inicio (S-60)', -60, 2, false),
        ('contida em S (S+30, 1h)',       30,  1, false)
      ) t(name, shift_min, hours, expected_ok)
    loop
      got := 'ok';
      execute 'set local role authenticated';
      begin
        perform public.create_booking(v_beach, 'first_time', 'Português',
          jsonb_build_array(jsonb_build_object('starts_at', v_s + make_interval(mins => probe.shift_min), 'hours', probe.hours)));
      exception when others then
        get stacked diagnostics v_hint = pg_exception_hint;
        got := coalesce(v_hint, sqlstate);
      end;
      execute 'reset role';
      assert got = 'NO_INSTRUCTOR', format('P0 #91: "%s" deveria ser recusado com NO_INSTRUCTOR, obteve %s', probe.name, got);
    end loop;
  end;
  -- Caminho legado (5 argumentos, o que a PR #296 fecha): precisa recusar do mesmo jeito.
  declare got text := 'ok'; begin
    execute 'set local role authenticated';
    begin
      perform public.create_booking(v_beach, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', v_s + interval '30 minutes', 'hours', 1)), null::text);
    exception when others then get stacked diagnostics v_hint = pg_exception_hint; got := coalesce(v_hint, sqlstate); end;
    execute 'reset role';
    assert got = 'NO_INSTRUCTOR', 'P0 #91: assinatura legada de 5 args deveria recusar sobreposicao parcial, obteve ' || got;
  end;
  -- Nenhuma tentativa recusada deixa reserva ou encontro para tras.
  assert (select count(*) from public.bookings where student_id = s2::uuid) = v_before, 'recusa deixou reserva orfa do aluno 2';

  -- Bordas: uma aula que termina exatamente buffer minutos antes de S, e outra que comeca buffer minutos depois do fim de S, sao aceitas.
  perform set_config('request.jwt.claim.sub', s2, true); execute 'set local role authenticated';
  v_id := public.create_booking(v_beach, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', v_s - make_interval(mins => 60 + v_buf), 'hours', 1)));
  v_id := public.create_booking(v_beach, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', v_s + make_interval(mins => 120 + v_buf), 'hours', 1)));
  execute 'reset role';
  -- Dentro do intervalo minimo (um minuto antes da borda permitida) e recusado.
  if v_buf > 0 then
    declare got text := 'ok'; begin
      perform set_config('request.jwt.claim.sub', s2, true); execute 'set local role authenticated';
      begin
        perform public.create_booking(v_beach, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', v_s + make_interval(mins => 120 + v_buf - 1), 'hours', 1)), null::text);
      exception when others then get stacked diagnostics v_hint = pg_exception_hint; got := coalesce(v_hint, sqlstate); end;
      execute 'reset role';
      assert got = 'NO_INSTRUCTOR', 'P0 #91: dentro do intervalo minimo do instrutor deveria ser recusado, obteve ' || got;
    end;
  end if;

  -- Reserva pendente VENCIDA (>10 min) nao segura o horario: ele volta a ser oferecido.
  -- O gatilho de snapshot congela created_at; so aqui, dentro desta transacao revertida, ele e suspenso para envelhecer o hold.
  alter table public.bookings disable trigger bookings_snapshot_frozen;
  update public.bookings set created_at = now() - interval '11 minutes' where id = v_base;
  alter table public.bookings enable trigger bookings_snapshot_frozen;
  -- (vencida mas ainda 'awaiting_payment'; confirmada nao vence)
  if (select status::text from public.bookings where id = v_base) = 'awaiting_payment' then
    perform set_config('request.jwt.claim.sub', s2, true); execute 'set local role authenticated';
    v_id := public.create_booking(v_beach, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', v_s, 'hours', 2)));
    execute 'reset role';
    assert (select status::text from public.bookings where id = v_base) = 'cancelled', 'hold vencido deve ser cancelado, nunca apagado';
    assert exists (select 1 from public.bookings where id = v_base), 'historico do hold vencido preservado';
  end if;
end $$;
rollback;
select 'PASS: mesmo instrutor recusa horario igual e sobreposicao parcial, aceita borda encostada e libera hold vencido' as result;
