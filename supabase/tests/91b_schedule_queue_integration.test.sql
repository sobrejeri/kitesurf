-- #91 Módulo 2: alterar a agenda devolve à fila as ofertas abertas que deixaram de caber (sem apagar aulas) e a aceitação
-- continua revalidando a disponibilidade. Descartável, tudo revertido.
\set ON_ERROR_STOP on
begin;
create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', uid, false); execute 'set role authenticated'; end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', false); end $$;

do $$
declare
  b1 constant text := '00000000-0000-0000-0000-0000000000b1';
  b2 constant text := '00000000-0000-0000-0000-0000000000b2';
  prea uuid; day_ date; st timestamptz; plan jsonb; req1 uuid; req2 uuid; off1 uuid; x1 uuid; x2 uuid; off2 uuid; res jsonb; wd int; days jsonb; v_acc uuid;
begin
  select id into strict prea from public.beaches where slug = 'prea';
  day_ := (now() at time zone 'America/Fortaleza')::date + 40;
  st := ((day_ + time '10:00') at time zone 'America/Fortaleza');
  plan := jsonb_build_array(jsonb_build_object('starts_at', st, 'hours', 2));
  wd := extract(dow from day_)::int;

  -- 1) A abre oferta ao primeiro instrutor; ele fecha aquele dia da semana; a oferta é devolvida à fila.
  perform pg_temp.act_as(b1);
  req1 := public.create_instructor_request(prea, 'first_time', 'Português', plan, 'mar-e-vento', false);
  perform pg_temp.reset();
  select id, instructor_id into off1, x1 from public.instructor_offers where request_id = req1 and status = 'offered';
  assert off1 is not null, 'precisa haver oferta aberta';
  select coalesce(jsonb_agg(jsonb_build_object('weekday', g, 'opens', '08:00', 'closes', '20:00')), '[]'::jsonb) into days
    from generate_series(0, 6) g where g <> wd;
  perform pg_temp.act_as(x1::text);
  res := public.save_my_weekly_schedule(days, 0);
  perform pg_temp.reset();
  assert (res->>'offers_advanced')::int = 1, 'oferta devolvida à fila: ' || res::text;
  assert (select status from public.instructor_offers where id = off1) = 'declined', 'oferta antiga recusada';
  assert not exists (select 1 from public.instructor_offers where request_id = req1 and instructor_id = x1 and status = 'offered'), 'instrutor sem oferta aberta';
  assert exists (select 1 from public.audit_logs where action = 'offer.withdrawn_availability' and entity_id = off1::text), 'auditoria da devolução';
  assert (select status from public.instructor_requests where id = req1) in ('searching', 'expired'), 'solicitação segue a fila';
  -- o mesmo instrutor não volta a receber essa solicitação
  assert not exists (select 1 from public.instructor_offers where request_id = req1 and instructor_id = x1 and status = 'offered'), 'não reoferta ao mesmo instrutor';

  -- 2) Férias que cobrem o horário também devolvem a oferta; a aceitação tardia é recusada.
  perform pg_temp.act_as(b2);
  req2 := public.create_instructor_request(prea, 'first_time', 'Português',
    jsonb_build_array(jsonb_build_object('starts_at', st + interval '1 day', 'hours', 2)), 'mar-e-vento', false);
  perform pg_temp.reset();
  select id, instructor_id into off2, x2 from public.instructor_offers where request_id = req2 and status = 'offered';
  assert off2 is not null, 'FIXTURE: segunda solicitação sem oferta aberta';
  begin
    perform pg_temp.act_as(x2::text);
    perform public.add_my_time_off(((day_ - 1)::timestamp at time zone 'America/Fortaleza'), ((day_ + 2)::timestamp at time zone 'America/Fortaleza'), 'vacation', 'ferias');
    perform pg_temp.reset();
    assert (select status from public.instructor_offers where id = off2) = 'declined', 'férias devolvem a oferta';
    perform pg_temp.act_as(x2::text);
    -- aceitar uma oferta já devolvida não cria reserva (retorno nulo ou recusa)
    begin v_acc := public.accept_instructor_offer(off2); exception when others then v_acc := null; end;
    assert v_acc is null, 'aceite de oferta devolvida não pode criar reserva';
    perform pg_temp.reset();
    assert (select booking_id from public.instructor_requests where id = req2) is null, 'nenhuma reserva criada';
  end;
end $$;
rollback;
select 'PASS: alterar agenda devolve ofertas abertas à fila, audita, não reoferta ao mesmo instrutor e a aceitação tardia é recusada' as result;
