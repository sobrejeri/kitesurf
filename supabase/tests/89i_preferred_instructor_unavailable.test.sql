-- Instrutor PREFERIDO sem agenda na data pedida (migrations 20261113000043/20261114002000, que removem a isencao da migration 14).
-- CARACTERIZACAO: com a cadeia completa, o preferido que NAO atende a data original NAO recebe a oferta (como qualquer instrutor);
-- a busca segue para os demais. Consequencia de produto a decidir: ele perde a chance de ofertar/sugerir OUTRA data.
-- (A migration 14 isentava o preferido justamente para ele poder sugerir; ver comentario em 20261101000014_date_suggestions.sql.)
-- Banco descartavel; tudo revertido no ROLLBACK.
\set ON_ERROR_STOP on
begin;
do $$
declare
  a1 constant uuid := '00000000-0000-0000-0000-0000000000a1';
  stu constant uuid := '00000000-0000-0000-0000-0000000000b1';
  t timestamptz; v_req uuid; v_offered_to_a1 int; v_total int;
begin
  t := (((now() at time zone 'America/Fortaleza')::date + 60)::timestamp + interval '9 hours') at time zone 'America/Fortaleza';
  -- a1 de folga na data pedida
  insert into public.instructor_time_off(instructor_id, starts_at, ends_at, reason) values (a1, t - interval '1 hour', t + interval '3 hours', 'teste 89i');
  assert not public.instructor_can_attend(a1, jsonb_build_array(jsonb_build_object('starts_at', t, 'hours', 1))), 'fixture: a1 deveria estar indisponivel';

  perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
  v_req := public.create_instructor_request_with_preference((select id from public.beaches where slug = 'prea'), 'first_time', 'Português',
             jsonb_build_array(jsonb_build_object('starts_at', t, 'hours', 1)), null, false, a1);
  execute 'reset role';
  perform public.advance_instructor_offer(v_req);   -- chamada interna (a funcao e fechada a API)

  select count(*) into v_offered_to_a1 from public.instructor_offers where request_id = v_req and instructor_id = a1;
  assert v_offered_to_a1 = 0, 'preferido indisponivel NAO deve receber oferta (versao com a checagem de agenda): ' || v_offered_to_a1;
end $$;
rollback;
select 'PASS (caracterizacao): instrutor preferido sem agenda na data pedida nao recebe oferta; perde a chance de sugerir outra data' as result;
