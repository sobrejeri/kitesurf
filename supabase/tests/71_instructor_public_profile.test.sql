-- Tela "Perfil do instrutor": só quem tem reserva com o instrutor lê, sem dados pessoais e sem identificar quem avaliou.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',uid,false); execute 'set role authenticated'; end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub','',false); end $$;

do $$
declare bid uuid; inst uuid; p jsonb;
begin
  select id, instructor_id into bid, inst from public.bookings where code='VNT-1001';
  assert inst is not null and (select status::text from public.bookings where id=bid) in ('confirmed','completed'), 'fixture: VNT-1001 com instrutor';
  assert exists (select 1 from public.instructor_ratings where booking_id=bid), 'fixture: avaliacao da 70_ratings';

  -- O aluno da reserva le o perfil.
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
  p := public.get_instructor_public_profile(inst);
  perform pg_temp.reset();
  assert p->>'id' = inst::text and length(p->>'name') > 0, 'perfil devolve id e nome';
  assert (p->>'rating_count')::int >= 1 and (p->>'rating_avg')::numeric between 1 and 5, 'nota e contagem';
  assert jsonb_array_length(p->'reviews') >= 1, 'comentarios aparecem';
  -- Sem dado pessoal e sem identificar quem avaliou.
  assert not (p ? 'phone' or p ? 'city' or p ? 'email' or p ? 'cpf' or p ? 'payout' or p ? 'student_id' or p ? 'booking_id'), 'sem PII no nivel raiz';
  assert not (p->'reviews'->0 ? 'student_id' or p->'reviews'->0 ? 'booking_id' or p->'reviews'->0 ? 'name'), 'avaliacao anonima';
  assert p::text !~* '(@|\d{3}\.\d{3}\.\d{3})', 'nenhum e-mail ou CPF no JSON';

  -- Outro aluno (sem reserva com este instrutor): nao le por id.
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
  begin
    perform public.get_instructor_public_profile(inst);
    raise exception 'aluno sem reserva leu o perfil';
  exception when sqlstate 'P0002' then null; end;
  perform pg_temp.reset();

  -- Instrutor nao usa a tela do aluno.
  perform pg_temp.act_as(inst::text);
  begin
    perform public.get_instructor_public_profile(inst);
    raise exception 'instrutor leu pelo caminho do aluno';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  -- id nulo ou inexistente: mesmo erro, sem pista.
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
  begin perform public.get_instructor_public_profile(null); raise exception 'null aceito';
  exception when sqlstate 'P0002' then null; end;
  begin perform public.get_instructor_public_profile(gen_random_uuid()); raise exception 'id inexistente aceito';
  exception when sqlstate 'P0002' then null; end;
  perform pg_temp.reset();

  -- Permissoes: anon e PUBLIC sem EXECUTE; authenticated com.
  assert not has_function_privilege('anon', 'public.get_instructor_public_profile(uuid)', 'EXECUTE'), 'anon nao executa';
  assert has_function_privilege('authenticated', 'public.get_instructor_public_profile(uuid)', 'EXECUTE'), 'authenticated executa';
end $$;
select 'PASS: perfil do instrutor so para quem tem reserva, sem PII e com avaliacao anonima' as result;
