-- Lote #2 (tarefa 8): IDOR e AUTORIA. (a) inventário fechado das RPCs de authenticated que RECEBEM identidade como parâmetro; (b) a única que não é admin-only
-- (get_instructor_profile_progress) só serve o próprio instrutor ou o Admin; (c) a autoria dos registros vem de auth.uid(), nunca do cliente.
-- Banco descartável; tudo revertido (ROLLBACK).
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

do $$
declare
  a1 constant uuid := '00000000-0000-0000-0000-0000000000a1'; a2 constant uuid := '00000000-0000-0000-0000-0000000000a2';
  b1 constant uuid := '00000000-0000-0000-0000-0000000000b1'; b2 constant uuid := '00000000-0000-0000-0000-0000000000b2';
  adm constant uuid := '00000000-0000-0000-0000-00000000000a';
  -- (a) Funções de authenticated (SECURITY DEFINER) com parâmetro de identidade. Qualquer uma nova precisa ser decidida aqui.
  admin_only constant text[] := array['admin_set_tax_id(uuid,text,text)', 'create_admin_test_booking(uuid,uuid,uuid,jsonb)',
    'create_admin_test_lesson(uuid,uuid,uuid,timestamp with time zone,integer)', 'set_instructor_commission(uuid,integer,text)', 'set_instructor_status(uuid,instructor_status,text)'];
  self_or_admin constant text[] := array['get_instructor_profile_progress(uuid)'];
  v text; r text; bk uuid; mt uuid; mid uuid; inc uuid; n int;
begin
  -- (a)
  select string_agg(p.oid::regprocedure::text, ', ') into v from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and exists (select 1 from unnest(coalesce(p.proargnames, '{}')) a where a ~* '^p_(user|sender|author|owner|actor|reported_by|student|instructor|recipient|profile)(_id)?$')
    and p.oid::regprocedure::text <> all (admin_only || self_or_admin);
  assert v is null, 'NOVA RPC com parâmetro de identidade (decida: admin-only ou dono): ' || v;
  select string_agg(x, ', ') into v from unnest(admin_only) x where not exists (select 1 from pg_proc p where p.oid::regprocedure::text = x and p.prosrc ~* 'require_role\(\s*array\[\s*''admin''\s*\]');
  assert v is null, 'RPC admin-only sem require_role(admin): ' || v;

  -- (b) get_instructor_profile_progress: só o próprio instrutor ou o admin
  r := pg_temp.try(format('select public.get_instructor_profile_progress(%L)', a1), a2);  assert r like '42501:%', 'outro instrutor lê o progresso alheio: ' || r;
  r := pg_temp.try(format('select public.get_instructor_profile_progress(%L)', a1), b1);  assert r like '42501:%', 'aluno lê progresso de instrutor: ' || r;
  r := pg_temp.try(format('select public.get_instructor_profile_progress(%L)', a1), a1);  assert r = 'ok', 'o próprio instrutor lê: ' || r;
  r := pg_temp.try(format('select public.get_instructor_profile_progress(%L)', a1), adm); assert r = 'ok', 'o admin lê: ' || r;
  r := pg_temp.try('select public.get_instructor_profile_progress(NULL)', a1);             assert r like '42501:%', 'id nulo é recusado: ' || r;

  -- as 5 admin-only recusam os outros papéis ANTES de qualquer efeito, mesmo apontando para dados de terceiros
  foreach v in array array[format('select public.admin_set_tax_id(%L, ''cpf'', ''52998224725'')', a1), format('select public.set_instructor_commission(%L, 1000, ''x'')', a1),
                           format('select public.set_instructor_status(%L, ''approved'', ''x'')', a2)] loop
    r := pg_temp.try(v, b1); assert r like '42501:%', 'aluno chamou RPC admin-only: ' || v || ' -> ' || r;
    r := pg_temp.try(v, a1); assert r like '42501:%', 'instrutor chamou RPC admin-only: ' || v || ' -> ' || r;
  end loop;

  -- (c) AUTORIA: a mensagem, o relato e a auditoria carregam o autor da SESSÃO
  select b.id into bk from public.bookings b where b.code = 'VNT-1001';
  assert bk is not null, 'FIXTURE: VNT-1001';
  select m.id into mt from public.booking_meetings m where m.booking_id = bk order by m.position limit 1;
  assert (select student_id from public.bookings where id = bk) = b1 and (select instructor_id from public.bookings where id = bk) = a1, 'FIXTURE: VNT-1001 é de b1 com a1';
  r := pg_temp.try(format('select public.send_booking_message(%L, ''mensagem de teste de autoria'')', bk), b1);
  assert r = 'ok', 'mensagem do dono: ' || r;
  select id into mid from public.booking_messages where booking_id = bk and body = 'mensagem de teste de autoria';
  assert (select sender_id from public.booking_messages where id = mid) = b1, 'sender_id = quem estava logado';
  r := pg_temp.try(format('select public.send_booking_message(%L, ''intruso'')', bk), b2);  assert r like '42501:%', 'aluno de outra reserva não envia: ' || r;
  r := pg_temp.try(format('select public.send_booking_message(%L, ''intruso'')', bk), a2);  assert r like '42501:%', 'instrutor de outra reserva não envia: ' || r;
  update public.booking_meetings set starts_at = now() - interval '2 hours' where id = mt;
  r := pg_temp.try(format('select public.report_lesson_incident(%L, %L, ''other'', 0, ''descricao de teste de autoria'')', bk, mt), b1);
  assert r = 'ok', 'relato do dono: ' || r;
  select id into inc from public.booking_incidents where booking_id = bk and description = 'descricao de teste de autoria';
  assert (select reported_by from public.booking_incidents where id = inc) = b1, 'reported_by = quem estava logado';
  assert (select actor_id from public.audit_logs where action = 'incident.reported' and entity_id = inc::text) = b1, 'a auditoria registra o autor da sessão';
  r := pg_temp.try(format('select public.report_lesson_incident(%L, %L, ''other'', 0, ''descricao de intruso aqui'')', bk, mt), a2);
  assert r like '42501:%', 'instrutor de fora não relata: ' || r;
  select count(*) into n from public.booking_incidents where booking_id = bk and description = 'descricao de intruso aqui';
  assert n = 0, 'recusa não deixa relato';
  -- autoria não é forjável por escrita direta: nenhum cliente escreve nessas tabelas
  foreach v in array array['insert into public.booking_messages(booking_id, sender_id, body) values (''' || bk || ''', ''' || a1 || ''', ''forjada'')',
                           'update public.booking_messages set sender_id = ''' || a1 || ''' where id = ''' || mid || '''',
                           'update public.booking_incidents set reported_by = ''' || a1 || ''' where id = ''' || inc || '''',
                           'insert into public.audit_logs(actor_id, action, entity, entity_id) values (''' || a1 || ''', ''forjada'', ''x'', ''x'')'] loop
    r := pg_temp.try(v, b1); assert r like '42501:%', 'escrita direta de autoria deve ser negada: ' || v || ' -> ' || r;
  end loop;
end $$;
rollback;
select 'PASS: IDOR e autoria: inventário fechado de RPCs com parâmetro de identidade, progresso do instrutor só do próprio ou admin, autoria vem da sessão e não é forjável' as result;
