-- #92 regressão: "a solicitação de reserva não aparece quando existe apenas um instrutor".
-- Com UM instrutor elegível na praia (jeri = a1), prova no banco descartável, um a um, o que faz a solicitação aparecer ou NÃO aparecer para ele,
-- e o que cura sozinho. Tudo revertido (ROLLBACK).
--  V) visibilidade: o instrutor com a oferta lê a oferta E a solicitação pela RLS (embed que a página usa); outro instrutor e outro aluno não leem
--  E) elegibilidade: cada requisito (status, praia, idioma, veículo de apoio, agenda, bloqueio) sozinho tira a oferta e, restaurado, ela volta
--  B) ocupado: com a única pessoa ocupada por outra oferta aberta no mesmo horário, a 2ª solicitação fica SEM oferta e nasce a oferta ao atualizar a busca
--  X) expiração: oferta sem resposta expira em 2 min e, com um instrutor só, NÃO é reofertada (comportamento da fila A→B→C: quem já teve a oferta não a recebe de novo);
--     a solicitação segue 'searching' até o prazo dela
\set ON_ERROR_STOP on
begin;
create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', uid, false); execute 'set role authenticated'; end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', false); end $$;
create function pg_temp.req(student text, beach uuid, st timestamptz, hours int, lang text default 'Português', transport boolean default false) returns uuid language plpgsql as $$
declare r uuid;
begin
  perform pg_temp.act_as(student);
  r := public.create_instructor_request(beach, 'first_time', lang, jsonb_build_array(jsonb_build_object('starts_at', st, 'hours', hours)), null::text, transport);
  perform pg_temp.reset();
  return r;
end $$;
create function pg_temp.offered(r uuid) returns boolean language sql as $$
  select exists(select 1 from public.instructor_offers where request_id = r and status in ('offered')) $$;

do $$
declare
  a1 constant uuid := '00000000-0000-0000-0000-0000000000a1';
  a2 constant uuid := '00000000-0000-0000-0000-0000000000a2';
  b1 constant text := '00000000-0000-0000-0000-0000000000b1';
  b2 constant text := '00000000-0000-0000-0000-0000000000b2';
  jeri uuid; d date; st timestamptz; r uuid; r2 uuid; o uuid; n int; eligible int; orig_langs text[]; orig_vehicle boolean;
begin
  select id into strict jeri from public.beaches where slug = 'jeri';
  -- FIXTURE: a1 é o ÚNICO instrutor aprovado e elegível em jeri
  select count(*) into eligible from public.instructors i join public.instructor_beaches ib on ib.instructor_id = i.id
   where ib.beach_id = jeri and i.status = 'approved';
  assert eligible = 1, 'FIXTURE: precisa haver exatamente 1 instrutor aprovado em jeri, há ' || eligible;
  select languages, has_support_vehicle into orig_langs, orig_vehicle from public.instructors where id = a1;
  d := (now() at time zone 'America/Fortaleza')::date + 50;
  st := ((d + time '10:00') at time zone 'America/Fortaleza');
  delete from public.instructor_weekly_hours where instructor_id = a1;
  delete from public.instructor_schedule_settings where instructor_id = a1;   -- sem agenda salva = sem restrição (regra legada)

  -- V) visibilidade pela RLS
  r := pg_temp.req(b1, jeri, st, 2);
  select id into o from public.instructor_offers where request_id = r and instructor_id = a1 and status = 'offered';
  assert o is not null, 'V: o instrutor único recebeu a oferta';
  perform pg_temp.act_as(a1::text);
  select count(*) into n from public.instructor_offers f join public.instructor_requests q on q.id = f.request_id
   where f.status = 'offered' and f.expires_at > now() and f.id = o;
  assert n = 1, 'V: o instrutor lê a oferta COM a solicitação (embed da página)';
  assert (select total_hours from public.instructor_requests where id = r) = 2, 'V: o instrutor lê os dados da solicitação';
  perform pg_temp.act_as(a2::text);
  assert (select count(*) from public.instructor_requests where id = r) = 0 and (select count(*) from public.instructor_offers where id = o) = 0, 'V: outro instrutor não lê';
  perform pg_temp.act_as(b2);
  assert (select count(*) from public.instructor_requests where id = r) = 0, 'V: outro aluno não lê';
  perform pg_temp.reset();
  perform public.decline_instructor_offer(o) where false;  -- (nenhuma ação: só garante que a função existe)
  update public.instructor_requests set status = 'cancelled' where id = r;
  update public.instructor_offers set status = 'declined' where request_id = r;

  -- E) elegibilidade: cada requisito sozinho
  update public.instructors set status = 'paused' where id = a1;
  r := pg_temp.req(b1, jeri, st + interval '1 day', 1);
  assert not pg_temp.offered(r), 'E: instrutor pausado não recebe oferta';
  update public.instructors set status = 'approved' where id = a1;
  update public.instructor_requests set status = 'cancelled' where id = r;

  delete from public.instructor_beaches where instructor_id = a1 and beach_id = jeri;
  r := pg_temp.req(b1, jeri, st + interval '1 day', 1);
  assert not pg_temp.offered(r), 'E: sem vínculo com a praia não recebe oferta';
  insert into public.instructor_beaches (instructor_id, beach_id) values (a1, jeri);
  update public.instructor_requests set status = 'cancelled' where id = r;

  r := pg_temp.req(b1, jeri, st + interval '1 day', 1, 'Francês');
  assert not pg_temp.offered(r), 'E: idioma que o instrutor não fala não recebe oferta';
  update public.instructor_requests set status = 'cancelled' where id = r;

  update public.instructors set has_support_vehicle = false where id = a1;
  r := pg_temp.req(b1, jeri, st + interval '1 day', 1, 'Português', true);
  assert not pg_temp.offered(r), 'E: pedido com transporte sem veículo de apoio não recebe oferta';
  update public.instructors set has_support_vehicle = orig_vehicle where id = a1;
  update public.instructor_requests set status = 'cancelled' where id = r;

  -- agenda salva fechada nesse dia da semana (a causa mais comum no uso real: o instrutor salvou só alguns dias)
  insert into public.instructor_schedule_settings (instructor_id, buffer_minutes) values (a1, 0);
  insert into public.instructor_weekly_hours (instructor_id, weekday, opens_at, closes_at)
    select a1, g, '08:00', '17:00' from generate_series(0, 6) g where g <> extract(dow from d + 2)::int;
  r := pg_temp.req(b1, jeri, ((d + 2 + time '10:00') at time zone 'America/Fortaleza'), 1);
  assert not pg_temp.offered(r), 'E: dia fora da agenda salva não recebe oferta';
  update public.instructor_requests set status = 'cancelled' where id = r;
  r := pg_temp.req(b1, jeri, ((d + 2 + time '10:00') at time zone 'America/Fortaleza') + interval '1 day', 1);
  assert pg_temp.offered(r), 'E: o dia seguinte (dentro da agenda) recebe a oferta';
  update public.instructor_requests set status = 'cancelled' where id = r; update public.instructor_offers set status = 'declined' where request_id = r;
  delete from public.instructor_weekly_hours where instructor_id = a1;
  delete from public.instructor_schedule_settings where instructor_id = a1;

  -- B) ocupado por outra oferta aberta no mesmo horário -> 2ª solicitação sem oferta; atualizar a busca cria a oferta depois que a 1ª sai
  r := pg_temp.req(b1, jeri, st + interval '3 days', 2);
  assert pg_temp.offered(r), 'B: a 1ª solicitação recebe a oferta';
  r2 := pg_temp.req(b2, jeri, st + interval '3 days', 2);
  assert not pg_temp.offered(r2), 'B: a 2ª solicitação, no mesmo horário, fica sem oferta enquanto a 1ª está aberta';
  assert (select status from public.instructor_requests where id = r2) = 'searching', 'B: a 2ª continua buscando';
  select id into o from public.instructor_offers where request_id = r and status = 'offered';
  perform pg_temp.act_as(a1::text); perform public.decline_instructor_offer(o); perform pg_temp.reset();
  assert not pg_temp.offered(r2), 'B: sem atualizar a busca, a 2ª continua sem oferta (depende do poller do aluno ou do worker)';
  perform pg_temp.act_as(b2); perform public.refresh_instructor_request(r2); perform pg_temp.reset();
  assert pg_temp.offered(r2), 'B: ao atualizar a busca a 2ª recebe a oferta';
  update public.instructor_requests set status = 'cancelled' where id in (r, r2); update public.instructor_offers set status = 'declined' where request_id in (r, r2);

  -- X) oferta sem resposta expira em 2 min; com um instrutor só não há segunda chance dentro da mesma solicitação
  r := pg_temp.req(b1, jeri, st + interval '5 days', 1);
  select id into o from public.instructor_offers where request_id = r and status = 'offered';
  assert (select expires_at - created_at from public.instructor_offers where id = o) <= interval '2 minutes', 'X: a oferta dura no máximo 2 minutos';
  update public.instructor_offers set expires_at = now() - interval '1 second', created_at = now() - interval '3 minutes' where id = o;
  perform pg_temp.act_as(b1); perform public.refresh_instructor_request(r); perform pg_temp.reset();
  assert (select status from public.instructor_offers where id = o) = 'expired', 'X: a oferta sem resposta expirou';
  assert not pg_temp.offered(r), 'X: com um instrutor só, a oferta expirada não é reenviada ao mesmo instrutor';
  assert (select status from public.instructor_requests where id = r) = 'searching', 'X: a solicitação segue buscando até o prazo dela';
  perform pg_temp.act_as(a1::text);
  assert (select count(*) from public.instructor_offers where request_id = r and status = 'offered') = 0, 'X: o instrutor não vê mais a solicitação (ela só aparece enquanto a oferta está aberta)';
  perform pg_temp.reset();
end $$;
rollback;
select 'PASS: um instrutor só: visibilidade pela RLS, elegibilidade, ocupado + atualização da busca e expiração sem reoferta' as result;
