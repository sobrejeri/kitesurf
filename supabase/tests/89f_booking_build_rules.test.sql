-- #90: montagem da reserva. Banco descartável, tudo revertido no ROLLBACK; pagamento nunca real.
--  A) horários passados ou a menos de 1h do agora são recusados (e nada fica gravado)
--  B) limites: 1 a 8 horas por encontro, no máximo 8 horas no total, de 1 a 8 encontros, entradas inválidas
--  C) a divisão das horas entre encontros é exata: soma dos minutos = horas contratadas, em ordem cronológica,
--     mesmo quando o cliente manda os encontros fora de ordem; total e partes do preço fecham em centavos inteiros
--  D) encontros sobrepostos dentro do mesmo pedido são recusados
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

-- Proximo horario livre (instrutor a1, aluno b2 sem encontros por perto) com p_hours de duracao, em hora cheia local entre 8h e 10h.
create function pg_temp.slot_after(p_after timestamptz, p_hours int) returns timestamptz language sql as $$
  select c.st from (
    select (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => d, hours => h)) at time zone 'America/Fortaleza' st
    from generate_series(0, 200) d cross join generate_series(8, 10) h) c
  where c.st >= p_after
    and public.instructor_can_attend('00000000-0000-0000-0000-0000000000a1', jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', p_hours)))
    and not exists (select 1 from public.booking_meetings m join public.bookings k on k.id = m.booking_id
        where k.student_id = '00000000-0000-0000-0000-0000000000b2' and m.status::text <> 'cancelled' and k.status::text in ('confirmed', 'awaiting_payment')
          and tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.minutes), '[)') && tstzrange(c.st - interval '3 hours', c.st + make_interval(hours => p_hours + 3), '[)'))
  order by c.st limit 1
$$;

do $$
declare
  a1 constant uuid := '00000000-0000-0000-0000-0000000000a1';
  stu constant uuid := '00000000-0000-0000-0000-0000000000b2';
  v_jeri uuid; r text; v_before bigint; s1 timestamptz; s2 timestamptz; s3 timestamptz; s4 timestamptz; v_id uuid; v_next timestamptz := now() + interval '5 days';
  v_split text; v_hours int[]; v_slots timestamptz[]; i int; v_pl jsonb; v_rate int; v_bk record;
begin
  select id into strict v_jeri from public.beaches where slug = 'jeri';
  select count(*) into v_before from public.bookings where student_id = stu;

  -- ---------- A) passado e menos de 1h ----------
  foreach r in array array[
    format('select public.create_booking(%L, ''first_time'', ''Português'', jsonb_build_array(jsonb_build_object(''starts_at'', %L::timestamptz, ''hours'', 1)))', v_jeri, now() - interval '1 day'),
    format('select public.create_booking(%L, ''first_time'', ''Português'', jsonb_build_array(jsonb_build_object(''starts_at'', %L::timestamptz, ''hours'', 1)))', v_jeri, now() - interval '5 minutes'),
    format('select public.create_booking(%L, ''first_time'', ''Português'', jsonb_build_array(jsonb_build_object(''starts_at'', %L::timestamptz, ''hours'', 1)))', v_jeri, now() + interval '59 minutes')]
  loop
    declare res text := pg_temp.try(r, stu);
    begin assert res like '22023:%least one hour%' or res='22023:Invalid meeting date or hours', 'A: horario passado ou a menos de 1h deveria dar 22023: ' || res; end;
  end loop;
  -- um encontro valido e outro passado no mesmo pedido: o pedido inteiro cai
  s1 := pg_temp.slot_after(v_next, 1);
  r := pg_temp.try(format('select public.create_booking(%L, ''first_time'', ''Português'', jsonb_build_array(jsonb_build_object(''starts_at'', %L::timestamptz, ''hours'', 1), jsonb_build_object(''starts_at'', %L::timestamptz, ''hours'', 1)))', v_jeri, s1, now() - interval '1 day'), stu);
  assert r like '22023:%', 'A: um encontro passado derruba o pedido todo: ' || r;
  assert (select count(*) from public.bookings where student_id = stu) = v_before, 'A: recusa nao pode deixar reserva';

  -- ---------- B) limites e entradas invalidas ----------
  foreach r in array array[
    format('select public.create_booking(%L, ''first_time'', ''Português'', jsonb_build_array(jsonb_build_object(''starts_at'', %L::timestamptz, ''hours'', 0)))', v_jeri, s1),
    format('select public.create_booking(%L, ''first_time'', ''Português'', jsonb_build_array(jsonb_build_object(''starts_at'', %L::timestamptz, ''hours'', 9)))', v_jeri, s1),
    format('select public.create_booking(%L, ''first_time'', ''Português'', jsonb_build_array(jsonb_build_object(''starts_at'', %L::timestamptz, ''hours'', 5), jsonb_build_object(''starts_at'', %L::timestamptz, ''hours'', 4)))', v_jeri, s1, s1 + interval '2 days'),
    format('select public.create_booking(%L, ''first_time'', ''Português'', ''[]''::jsonb)', v_jeri),
    format('select public.create_booking(%L, ''first_time'', ''Português'', ''{}''::jsonb)', v_jeri),
    format('select public.create_booking(%L, ''first_time'', %L, jsonb_build_array(jsonb_build_object(''starts_at'', %L::timestamptz, ''hours'', 1)))', v_jeri, repeat('x', 41), s1),
    format('select public.create_booking(%L, ''first_time'', ''Português'', jsonb_build_array(jsonb_build_object(''starts_at'', %L::timestamptz, ''hours'', 1)))', '00000000-0000-0000-0000-00000000dead', s1)]
  loop
    declare res text := pg_temp.try(r, stu);
    begin assert res like '22023:%' or res like 'P0002:%', 'B: entrada invalida deveria ser recusada (22023): ' || r || ' -> ' || res; end;
  end loop;
  -- 9 encontros de 1h (mais de 8 encontros) tambem cai
  r := pg_temp.try(format('select public.create_booking(%L, ''first_time'', ''Português'', (select jsonb_agg(jsonb_build_object(''starts_at'', %L::timestamptz + make_interval(days => g), ''hours'', 1)) from generate_series(1, 9) g))', v_jeri, s1), stu);
  assert r like '22023:%', 'B: mais de 8 encontros deveria ser recusado: ' || r;
  assert (select count(*) from public.bookings where student_id = stu) = v_before, 'B: recusas nao deixam reservas';

  -- ---------- C) divisao exata das horas ----------
  select hourly_rate_cents into v_rate from public.price_versions order by id desc limit 1;
  foreach v_split in array array['3,2', '1,1,1', '2,2,2,2', '8', '1,2,3,2'] loop
    v_hours := string_to_array(v_split, ',')::int[];
    v_slots := '{}'; v_next := now() + interval '5 days';
    for i in 1 .. array_length(v_hours, 1) loop
      s1 := pg_temp.slot_after(v_next, v_hours[i]);
      assert s1 is not null, 'FIXTURE: sem horario para a divisao ' || v_split;
      v_slots := v_slots || s1;
      v_next := s1 + interval '1 day';
    end loop;
    -- o cliente manda os encontros FORA de ordem: o banco ordena por data
    select jsonb_agg(jsonb_build_object('starts_at', v_slots[g], 'hours', v_hours[g]) order by case when g % 2 = 0 then g else 100 - g end) into v_pl from generate_series(1, array_length(v_hours, 1)) g;
    perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
    v_id := public.create_booking(v_jeri, 'first_time', 'Português', v_pl);
    execute 'reset role';
    select * into v_bk from public.bookings where id = v_id;
    assert v_bk.total_hours = (select sum(x) from unnest(v_hours) x), 'C: total_hours deveria ser a soma de ' || v_split;
    assert (select sum(minutes) from public.booking_meetings where booking_id = v_id) = v_bk.total_hours * 60, 'C: soma dos minutos diverge das horas contratadas em ' || v_split;
    assert (select count(*) from public.booking_meetings where booking_id = v_id) = array_length(v_hours, 1), 'C: numero de encontros em ' || v_split;
    assert (select array_agg(minutes::int order by position) from public.booking_meetings where booking_id = v_id) = (select array_agg(h * 60 order by o) from unnest(v_hours) with ordinality t(h, o)), 'C: minutos por encontro (em ordem cronologica) em ' || v_split;
    assert (select bool_and(m.starts_at > p.starts_at) from public.booking_meetings m join public.booking_meetings p on p.booking_id = m.booking_id and p.position = m.position - 1 where m.booking_id = v_id) is not false, 'C: posicoes devem seguir a ordem cronologica em ' || v_split;
    assert v_bk.hourly_rate_cents = v_rate and v_bk.total_cents = v_bk.total_hours * v_rate, 'C: total deve ser horas x valor do banco, em centavos inteiros: ' || v_split;
    assert v_bk.partner_cents + v_bk.platform_cents + v_bk.instructor_net_cents = v_bk.total_cents, 'C: as partes do preco devem somar o total em ' || v_split;
    update public.bookings set status = 'cancelled', cancelled_at = now() where id = v_id;   -- libera a agenda para a proxima divisao
  end loop;

  -- ---------- D) sobreposicao dentro do mesmo pedido ----------
  s1 := pg_temp.slot_after(now() + interval '5 days', 2);
  r := pg_temp.try(format('select public.create_booking(%L, ''first_time'', ''Português'', jsonb_build_array(jsonb_build_object(''starts_at'', %L::timestamptz, ''hours'', 2), jsonb_build_object(''starts_at'', %L::timestamptz, ''hours'', 2)))', v_jeri, s1, s1 + interval '1 hour'), stu);
  assert r like '22023:%verlapping%', 'D: encontros sobrepostos no mesmo pedido deveriam ser recusados: ' || r;
  r := pg_temp.try(format('select public.create_booking(%L, ''first_time'', ''Português'', jsonb_build_array(jsonb_build_object(''starts_at'', %L::timestamptz, ''hours'', 1), jsonb_build_object(''starts_at'', %L::timestamptz, ''hours'', 1)))', v_jeri, s1, s1), stu);
  assert r like '22023:%verlapping%', 'D: encontro repetido (mesmo horario) deveria ser recusado: ' || r;
end $$;
rollback;
select 'PASS: montagem da reserva: passado/menos de 1h, limites, divisao exata das horas (soma, ordem, centavos) e sobreposicao no mesmo pedido' as result;
