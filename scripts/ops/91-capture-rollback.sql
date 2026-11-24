-- SOMENTE LEITURA. Gera (na saída) o rollback da migration 20261125100000_instructor_schedule_v2.sql a partir do estado ATUAL, ANTES de aplicá-la.
-- Uso:  psql -X -At -v ON_ERROR_STOP=1 -f scripts/ops/91-capture-rollback.sql > rollback_91.sql   (guardar FORA do repositório e do GitHub)
-- A migration SUBSTITUI cinco funções existentes (mesma assinatura): instructor_can_attend, can_move_meeting, save_my_schedule, block_my_time, unblock_my_time.
-- O rollback as devolve com pg_get_functiondef (corpo, SECURITY DEFINER, search_path), reafirma dono e ACL e CONFERE tudo contra o capturado.
-- Remove gatilhos e funções novos. NÃO apaga as tabelas novas (instructor_weekly_breaks, instructor_extra_hours) nem a coluna instructor_time_off.kind: são aditivas e
-- guardam dados do instrutor; sem elas o código antigo apenas as ignora. Para apagá-las é decisão separada.
\set QUIET on
\pset tuples_only on
\pset format unaligned
create temp table _f(sig text);
insert into _f values ('public.instructor_can_attend(uuid,jsonb)'), ('public.can_move_meeting(uuid,uuid,timestamptz,integer)'), ('public.save_my_schedule(integer[],time without time zone,time without time zone,integer)'),
  ('public.block_my_time(timestamp with time zone,timestamp with time zone,text)'), ('public.unblock_my_time(uuid)');
select '-- Rollback #91 gerado em ' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || ' (UTC).';
select '\set ON_ERROR_STOP on';
select 'begin;';
select 'set local lock_timeout = ''5s'';';
select 'drop trigger if exists guard_instructor_meeting_overlap_insert_update on public.booking_meetings;';
select 'drop trigger if exists guard_instructor_booking_change_update on public.bookings;';
select pg_get_functiondef(to_regprocedure(sig)) || ';' from _f order by sig;
select format('alter function %s owner to %I;', to_regprocedure(f.sig), pg_get_userbyid(p.proowner))
  from _f f join pg_proc p on p.oid = to_regprocedure(f.sig) order by f.sig;
select format('revoke all on function %s from public;', p.oid::regprocedure) || E'\n' ||
  coalesce((select string_agg(format('revoke all on function %s from %I;', p.oid::regprocedure, r.rolname), E'\n') from pg_roles r where r.rolname in ('anon','authenticated','service_role','postgres','supabase_admin')), '')
  from _f f join pg_proc p on p.oid = to_regprocedure(f.sig) order by f.sig;
select format('grant %s on function %s to %s;', a.privilege_type, p.oid::regprocedure, case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end)
  from _f f join pg_proc p on p.oid = to_regprocedure(f.sig) cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a order by f.sig, 1;
select 'drop function if exists public.' || x || ';' from unnest(array[
  'guard_instructor_meeting_overlap()', 'guard_instructor_booking_change()', 'assert_instructor_slot_free(uuid,uuid,timestamptz,integer)',
  'list_my_schedule_conflicts()', 'save_my_weekly_schedule(jsonb,integer)', 'add_my_time_off(timestamptz,timestamptz,text,text)',
  'add_my_extra_hours(date,time,time)', 'remove_my_extra_hours(uuid)', 'reconcile_instructor_availability(uuid)', 'instructor_slot_open(uuid,timestamptz,timestamptz)']) x;
select case when to_regclass('supabase_migrations.schema_migrations') is not null and not exists (select 1 from supabase_migrations.schema_migrations where version = '20261125100000')
  then 'delete from supabase_migrations.schema_migrations where version = ''20261125100000'';' else '-- ledger: nada a remover' end;
select 'do $verify$ declare got text; begin';
select format($f$  select md5(prosrc)||'|'||prosecdef||'|'||coalesce(proconfig::text,'')||'|'||pg_get_userbyid(proowner)||'|'||(select string_agg(x::text, ',' order by x::text) from unnest(coalesce(proacl, acldefault('f', proowner))) x)
    into got from pg_proc where oid = to_regprocedure(%L);
  if got is distinct from %L then raise exception '%% difere do original. esperado=%% obtido=%%', %L, %L, got; end if;$f$,
  p.oid::regprocedure::text,
  md5(p.prosrc)||'|'||p.prosecdef||'|'||coalesce(p.proconfig::text,'')||'|'||pg_get_userbyid(p.proowner)||'|'||(select string_agg(x::text, ',' order by x::text) from unnest(coalesce(p.proacl, acldefault('f', p.proowner))) x),
  p.oid::regprocedure::text,
  md5(p.prosrc)||'|'||p.prosecdef||'|'||coalesce(p.proconfig::text,'')||'|'||pg_get_userbyid(p.proowner)||'|'||(select string_agg(x::text, ',' order by x::text) from unnest(coalesce(p.proacl, acldefault('f', p.proowner))) x))
  from _f f join pg_proc p on p.oid = to_regprocedure(f.sig) order by f.sig;
select $f$  assert to_regprocedure('public.instructor_slot_open(uuid,timestamptz,timestamptz)') is null and to_regprocedure('public.save_my_weekly_schedule(jsonb,integer)') is null, 'função nova ainda existe';$f$;
select $f$  assert not exists (select 1 from pg_trigger where tgname in ('guard_instructor_meeting_overlap_insert_update','guard_instructor_booking_change_update') and not tgisinternal), 'gatilho novo ainda existe';$f$;
select 'end $verify$;';
select 'commit;';
select '-- fim do rollback #91';
