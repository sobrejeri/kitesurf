-- Lote #2 (tarefa 7): o HISTÓRICO nunca é apagado por cancelamento, remarcação ou qualquer RPC. Banco descartável; tudo revertido (ROLLBACK).
--   (1) nenhuma função de public apaga as tabelas de histórico (reservas, encontros, auditoria, evolução, avaliações, ocorrências, mensagens, localizações);
--   (2) nenhum papel de cliente tem DELETE ou TRUNCATE em tabela de public;
--   (3) auditoria é append-only (UPDATE e DELETE recusados);
-- (O cancelamento em si, com auditoria e encontros mantidos como 'cancelled', é exercitado em 89d, cenário S5; aqui ficam as garantias estruturais.)
\set ON_ERROR_STOP on
begin;
do $$
declare v text; n_audit int; r text;
begin
  -- (1)
  select string_agg(p.oid::regprocedure::text, ', ') into v from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.prosrc ~* 'delete\s+from\s+(only\s+)?(public\.)?(bookings|booking_meetings|audit_logs|meeting_skill_progress|instructor_ratings|booking_incidents|booking_messages|booking_message_locations|meeting_change_requests|balance_meeting_requests)\M';
  assert v is null, 'função que apaga tabela de histórico: ' || v;
  -- (2)
  select string_agg(grantee || ' ' || table_name || ' ' || privilege_type, ', ') into v from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('DELETE', 'TRUNCATE');
  assert v is null, 'cliente com DELETE/TRUNCATE: ' || v;
  -- (3)
  select count(*) into n_audit from public.audit_logs;
  assert n_audit > 0, 'FIXTURE: auditoria com linhas';
  begin delete from public.audit_logs where id = (select min(id) from public.audit_logs); r := 'apagou'; exception when others then r := sqlstate; end;
  assert r = '42501', 'DELETE em audit_logs deve ser recusado (insufficient_privilege): ' || r;
  begin update public.audit_logs set action = 'x' where id = (select min(id) from public.audit_logs); r := 'alterou'; exception when others then r := sqlstate; end;
  assert r = '42501', 'UPDATE em audit_logs deve ser recusado: ' || r;
end $$;
rollback;
select 'PASS: histórico nunca apagado: nenhuma função apaga as tabelas de histórico, clientes sem DELETE/TRUNCATE, auditoria append-only' as result;
