-- Lote de 10, item 8 (parte da base): MATRIZ DE PAPÉIS automática. Descobre toda RPC SECURITY DEFINER de authenticated que chama require_role(...)
-- e confere, para cada papel (aluno, instrutor, afiliado), que o papel NÃO listado é recusado pela regra de papel ("Not allowed for role") ANTES de qualquer outra
-- coisa, e que o papel listado passa por essa porta (a recusa, se vier, é de outro motivo). Admin atravessa a porta de papel por desenho e cai na checagem de dono.
-- Banco descartável; cada chamada roda em subtransação e tudo é revertido (ROLLBACK).
\set ON_ERROR_STOP on
begin;
do $$
declare
  roles constant text[] := array['student', 'instructor', 'partner', 'admin'];
  uid_of constant jsonb := jsonb_build_object(
    'student', '00000000-0000-0000-0000-0000000000b2', 'instructor', '00000000-0000-0000-0000-0000000000a1',
    'admin', '00000000-0000-0000-0000-00000000000a');
  partner_id uuid; f record; allowed text[]; who text; uid text; args text; msg text; st text; n_fn int := 0; n_calls int := 0; t record; i int; lit text;
begin
  select id into partner_id from public.profiles where role = 'partner' limit 1;
  assert partner_id is not null, 'FIXTURE: precisa existir um usuário com papel partner';
  assert (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000b2') = 'student'
     and (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000a1') = 'instructor'
     and (select role::text from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'admin', 'FIXTURE: papéis dos 4 usuários';

  for f in select p.oid, p.oid::regprocedure::text as sig, p.proname, p.proargtypes, p.pronargs, p.prosrc
           from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE')
             and p.prosrc ~* 'require_role\(\s*array\[' and p.prorettype <> 'trigger'::regtype order by 2 loop
    -- papéis aceitos = os da PRIMEIRA chamada a require_role no corpo
    allowed := array(select trim(both '''' from trim(x)) from unnest(string_to_array(
      (regexp_match(f.prosrc, 'require_role\(\s*array\[([^\]]*)\]', 'i'))[1], ',')) x);
    -- argumentos fictícios por tipo
    args := '';
    for i in 0 .. f.pronargs - 1 loop
      select * into t from pg_type where oid = (string_to_array(f.proargtypes::text, ' ')::oid[])[i + 1];
      lit := case
        when t.typname = 'uuid' then quote_literal(gen_random_uuid()::text)
        when t.typname in ('text', 'varchar') then quote_literal('x')
        when t.typname in ('int2', 'int4', 'int8') then '1'
        when t.typname = 'bool' then 'false'
        when t.typname = 'timestamptz' then quote_literal(now()::text)
        when t.typname = 'date' then quote_literal(current_date::text)
        when t.typname in ('float8', 'float4', 'numeric') then '0'
        when t.typname = 'jsonb' then quote_literal('[]')
        when t.typcategory = 'A' then quote_literal('{}')
        when t.typtype = 'e' then quote_literal((select enumlabel from pg_enum where enumtypid = t.oid order by enumsortorder limit 1))
        else 'NULL' end;
      args := args || case when i > 0 then ', ' else '' end || lit || '::' || format_type(t.oid, null);
    end loop;
    n_fn := n_fn + 1;
    foreach who in array roles loop
      uid := case when who = 'partner' then partner_id::text else uid_of ->> who end;
      perform set_config('request.jwt.claim.sub', uid, true);
      begin
        execute 'set local role authenticated';
        execute format('select public.%I(%s)', f.proname, args);
        msg := 'ok'; st := '00000';
      exception when others then
        get stacked diagnostics msg = message_text; st := sqlstate;
      end;
      execute 'reset role';
      n_calls := n_calls + 1;
      if who = 'admin' or who = any (allowed) then
        assert not (msg like 'Not allowed for role%'), format('%s: o papel %s deveria passar pela porta de papel (aceitos: %s) mas veio: %s', f.sig, who, allowed, msg);
      else
        assert msg like 'Not allowed for role%' and st = '42501', format('%s: o papel %s deveria ser recusado pela regra de papel (aceitos: %s) e veio %s:%s', f.sig, who, allowed, st, msg);
      end if;
    end loop;
  end loop;
  assert n_fn >= 40, 'a matriz deveria cobrir ao menos 40 RPCs, cobriu ' || n_fn;
  raise notice 'matriz de papéis: % RPCs x 4 papéis = % chamadas', n_fn, n_calls;
end $$;

-- Admin nunca é autoatribuído: o cadastro com role=admin nos metadados NÃO cria admin; e um usuário não se promove (UPDATE direto é negado).
do $$
declare v_role text; r text;
begin
  insert into auth.users(id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000f9999', 'auto-admin@test.invalid', '{"full_name":"Tentativa","role":"admin"}');
  select role::text into v_role from public.profiles where id = '00000000-0000-0000-0000-0000000f9999';
  assert v_role is not null and v_role <> 'admin', 'cadastro com role=admin nos metadados não pode virar admin: ' || coalesce(v_role, 'sem perfil');
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
  begin
    execute 'set local role authenticated';
    execute 'update public.profiles set role = ''admin'' where id = auth.uid()';
    r := 'ok';
  exception when others then r := sqlstate;
  end;
  execute 'reset role';
  assert r = '42501', 'o aluno não pode se promover a admin por UPDATE direto: ' || r;
  assert (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000b2') = 'student', 'continua aluno';
end $$;
rollback;
select 'PASS: matriz de papéis automática (aluno, instrutor, afiliado, admin) sobre todas as RPCs com require_role; admin nunca é autoatribuído' as result;
