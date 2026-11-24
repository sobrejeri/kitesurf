-- SOMENTE LEITURA. Gera (na saída) o SCRIPT DE ROLLBACK do #90 a partir do estado ATUAL do banco, ANTES de aplicar 20261116160000, 20261116170000 e 20261124080301.
-- Uso:  psql -X -At -v ON_ERROR_STOP=1 -f scripts/ops/90-capture-rollback.sql > rollback_90.sql   (guardar FORA do repositório e do GitHub)
-- Recupera, byte a byte: assinatura e nomes de parâmetros, DEFAULTs, corpo, SECURITY DEFINER/INVOKER, search_path (proconfig), dono, ACL (um GRANT por papel)
-- e comentário, para TODAS as assinaturas de public.create_booking. Remove o gatilho e a função novos. Termina conferindo tudo contra valores gravados na captura:
-- qualquer diferença aborta a transação inteira (nada muda).
\set QUIET on
\pset tuples_only on
\pset format unaligned
select '-- Rollback #90 gerado em ' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || ' (UTC) do estado capturado antes da aplicação.';
select '\set ON_ERROR_STOP on';
select 'begin;';
select 'set local lock_timeout = ''5s'';';
-- 1. Remover o que o #90 cria (ordem: gatilho, depois função).
select 'drop trigger if exists request_00_distinct_civil_days on public.instructor_requests;';
select 'drop function if exists public.guard_request_distinct_civil_days();';
-- 2. Apagar as assinaturas atuais de create_booking e recriar as ORIGINAIS (DROP + CREATE: CREATE OR REPLACE não consegue devolver defaults nem trocar o corpo de forma segura entre assinaturas).
select format('drop function if exists %s restrict;', p.oid::regprocedure)
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'create_booking' order by p.pronargs desc;
-- 3. Definições originais, com um delimitador próprio que não aparece no corpo.
select pg_get_functiondef(p.oid) || ';'
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'create_booking' order by p.pronargs desc;
-- 4. Dono, ACL exata (zera e reaplica) e comentário.
select format('alter function %s owner to %I;', p.oid::regprocedure, pg_get_userbyid(p.proowner))
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'create_booking' order by p.pronargs desc;
select format('revoke all on function %s from public;', p.oid::regprocedure) || E'\n' ||
  coalesce((select string_agg(format('revoke all on function %s from %I;', p.oid::regprocedure, r.rolname), E'\n')
            from pg_roles r where r.rolname in ('anon','authenticated','service_role','postgres','supabase_admin')), '')
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'create_booking' order by p.pronargs desc;
select format('grant %s on function %s to %s;', a.privilege_type, p.oid::regprocedure, case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end)
from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
where p.pronamespace = 'public'::regnamespace and p.proname = 'create_booking'
order by p.pronargs desc, 1;
select format('comment on function %s is %L;', p.oid::regprocedure, d.description)
from pg_proc p join pg_description d on d.objoid = p.oid and d.classoid = 'pg_proc'::regclass and d.objsubid = 0
where p.pronamespace = 'public'::regnamespace and p.proname = 'create_booking';
-- 5. Ledger: remover só as versões que NÃO estavam registradas na captura (as que já estavam ficam como estavam).
select case when to_regclass('supabase_migrations.schema_migrations') is not null then
  coalesce((select string_agg(format('delete from supabase_migrations.schema_migrations where version = %L;', v), E'\n')
            from unnest(array['20261116160000','20261116170000','20261124080301']) v
            where not exists (select 1 from supabase_migrations.schema_migrations s where s.version = v)), '')
  else '-- ledger supabase_migrations.schema_migrations ausente: nada a remover' end;
-- 6. Conferência final contra o estado capturado. Qualquer diferença => exceção => nada é aplicado.
select 'do $verify$ declare got text; begin';
select format($f$  assert (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'create_booking') = %s, 'numero de assinaturas de create_booking diferente do original';$f$,
              count(*)) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'create_booking';
select format($f$  select md5(prosrc)||'|'||pronargdefaults||'|'||prosecdef||'|'||coalesce(proconfig::text,'')||'|'||pg_get_userbyid(proowner)||'|'||(select string_agg(x::text, ',' order by x::text) from unnest(coalesce(proacl, acldefault('f', proowner))) x)||'|'||pg_get_function_arguments(oid)||'|'||pg_get_function_result(oid)||'|'||coalesce(obj_description(oid,'pg_proc'),'')
                into got from pg_proc where oid = to_regprocedure(%L);
  if got is distinct from %L then raise exception 'create_booking %% difere do original (corpo|defaults|definer|search_path|dono|ACL|argumentos|retorno|comentario). esperado=%% obtido=%%', %L, %L, got; end if;$f$,
              p.oid::regprocedure::text,
              md5(p.prosrc)||'|'||p.pronargdefaults||'|'||p.prosecdef||'|'||coalesce(p.proconfig::text,'')||'|'||pg_get_userbyid(p.proowner)||'|'||(select string_agg(x::text, ',' order by x::text) from unnest(coalesce(p.proacl, acldefault('f', p.proowner))) x)||'|'||pg_get_function_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||coalesce(obj_description(p.oid,'pg_proc'),''),
              p.oid::regprocedure::text,
              md5(p.prosrc)||'|'||p.pronargdefaults||'|'||p.prosecdef||'|'||coalesce(p.proconfig::text,'')||'|'||pg_get_userbyid(p.proowner)||'|'||(select string_agg(x::text, ',' order by x::text) from unnest(coalesce(p.proacl, acldefault('f', p.proowner))) x)||'|'||pg_get_function_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||coalesce(obj_description(p.oid,'pg_proc'),''))
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'create_booking' order by p.pronargs desc;
select $f$  assert to_regprocedure('public.guard_request_distinct_civil_days()') is null, 'funcao do guard ainda existe';$f$;
select $f$  assert not exists (select 1 from pg_trigger where tgname = 'request_00_distinct_civil_days' and not tgisinternal), 'gatilho do guard ainda existe';$f$;
select 'end $verify$;';
select 'commit;';
select '-- fim do rollback';
