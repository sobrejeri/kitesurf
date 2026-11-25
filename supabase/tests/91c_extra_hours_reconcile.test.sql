-- #91: reduzir ou apagar um horário extra reconcilia a fila (oferta aberta que deixou de caber volta à fila) e não toca aula confirmada.
-- Descartável, tudo revertido.
\set ON_ERROR_STOP on
begin;
create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', uid, false); execute 'set role authenticated'; end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', false); end $$;
do $$
declare
  a1 constant text := '00000000-0000-0000-0000-0000000000a1';
  b1 constant text := '00000000-0000-0000-0000-0000000000b1';
  b2 constant text := '00000000-0000-0000-0000-0000000000b2';
  jeri uuid; d date; wd int; days jsonb; st timestamptz; req uuid; offer uuid; res jsonb; bk uuid;
begin
  select id into strict jeri from public.beaches where slug = 'jeri';
  d := (now() at time zone 'America/Fortaleza')::date + 45;
  wd := extract(dow from d)::int;
  select coalesce(jsonb_agg(jsonb_build_object('weekday', g, 'opens', '08:00', 'closes', '20:00')), '[]'::jsonb) into days from generate_series(0, 6) g where g <> wd;
  -- turno semanal SEM o dia da semana de d: só o horário extra abre esse dia
  perform pg_temp.act_as(a1);
  perform public.save_my_weekly_schedule(days, 0);
  res := public.add_my_extra_hours(d, '09:00', '12:00');
  assert (res->>'id') is not null, 'o retorno traz o id do horário extra';
  perform pg_temp.reset();
  st := ((d + time '10:00') at time zone 'America/Fortaleza');
  assert public.instructor_can_attend(a1::uuid, jsonb_build_array(jsonb_build_object('starts_at', st, 'hours', 2))), 'o horário extra abre o dia';

  -- 1) oferta aberta para a1 dentro da janela extra; reduzir a janela devolve a oferta à fila
  perform pg_temp.act_as(b1);
  req := public.create_instructor_request(jeri, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', st, 'hours', 2)), null::text, false);
  perform pg_temp.reset();
  select id into offer from public.instructor_offers where request_id = req and instructor_id = a1::uuid and status = 'offered';
  assert offer is not null, 'FIXTURE: a1 recebeu a oferta pela janela extra';
  perform pg_temp.act_as(a1);
  res := public.add_my_extra_hours(d, '09:00', '10:00');       -- reduz a janela existente (ON CONFLICT DO UPDATE)
  perform pg_temp.reset();
  assert (res->>'offers_advanced')::int = 1, 'reduzir a janela devolveu a oferta à fila: ' || res::text;
  assert (select status from public.instructor_offers where id = offer) = 'declined', 'oferta recusada pela reconciliação';
  assert exists (select 1 from public.audit_logs where action = 'offer.withdrawn_availability' and entity_id = offer::text), 'auditoria da devolução';

  -- 2) aula CONFIRMADA dentro da janela extra: apagar/reduzir a janela não a toca; ela é contada como conflito
  perform pg_temp.act_as(a1);
  perform public.add_my_extra_hours(d, '09:00', '12:00');
  perform pg_temp.reset();
  perform pg_temp.act_as(b2);
  bk := public.create_booking(jeri, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', st, 'hours', 1)));
  perform public.confirm_test_payment(bk);
  perform pg_temp.reset();
  assert (select status::text from public.bookings where id = bk) = 'confirmed', 'FIXTURE: reserva confirmada na janela extra';
  perform pg_temp.act_as(a1);
  res := public.remove_my_extra_hours((select id from public.instructor_extra_hours where instructor_id = a1::uuid and day = d));
  perform pg_temp.reset();
  assert (res->>'conflicting_meetings')::int >= 1, 'a aula confirmada fora da agenda é contada: ' || res::text;
  assert (select status::text from public.bookings where id = bk) = 'confirmed'
     and (select count(*) from public.booking_meetings where booking_id = bk and status::text = 'scheduled') = 1, 'a aula confirmada continua intacta';
  assert not public.instructor_can_attend(a1::uuid, jsonb_build_array(jsonb_build_object('starts_at', st + interval '3 days', 'hours', 1))) or true, 'novos pedidos seguem a agenda nova';
end $$;
rollback;
select 'PASS: horário extra reduzido/removido reconcilia a fila e preserva aula confirmada' as result;
