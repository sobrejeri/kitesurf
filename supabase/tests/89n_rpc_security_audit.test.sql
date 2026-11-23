-- Lote de 10, item 3: AUDITORIA AUTOMÁTICA de segurança das RPCs, gatilhos e search_path (descartável; só leitura e chamadas que devem ser NEGADAS).
-- Qualquer função nova alcançável pela API precisa ser incluída aqui de propósito: o teste falha se a superfície crescer sem decisão.
-- Cobre: (A) SECURITY DEFINER sempre com search_path; (B) funções de gatilho com search_path; (C) o que o anon pode executar; (D) start_meeting negada e
-- start_ordered_meeting só para authenticated (privilégio E chamada efetiva); (E) notify_* não executáveis e gatilhos ainda ligados; (F) 4 funções com search_path
-- fixo; (G) internos da #323 fechados; (H) RLS em toda tabela e escrita direta de cliente só onde decidido; (I) cada RPC SECURITY DEFINER de authenticated tem
-- verificação de papel/dono; (J) inventário fechado da superfície de authenticated.
\set ON_ERROR_STOP on
begin;

create function pg_temp.try(q text, who text) returns text language plpgsql as $$
declare st text; msg text;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
  execute 'set local role ' || who;
  begin execute q; exception when others then get stacked diagnostics msg = message_text; st := sqlstate; end;
  execute 'reset role';
  return coalesce(st || ':' || msg, 'ok');
end $$;

do $$
declare
  v text; r text;
  -- (C) Única superfície SECURITY DEFINER que o anon pode executar: catálogo público de preço e verificação de admin (decisão: APIs intencionais).
  anon_ok constant text[] := array['is_admin()', 'quote_preview(integer)', 'quote_table()', 'quote_table_by_level()'];
  -- (H) Escrita direta de cliente em tabela: só o que foi decidido (colunas de perfil/dados de repasse do próprio dono, protegidos por RLS).
  write_ok constant text[] := array['authenticated partner_payout_details'];
  -- (I) Sem verificação interna de papel por escolha: catálogo público de preços.
  no_check_ok constant text[] := array['quote_preview(integer)', 'quote_table()', 'quote_table_by_level()'];
  -- (J) Inventário fechado: tudo que authenticated executa e é SECURITY DEFINER (gerado do estado real do banco de teste em 23/11/2026).
  inventory constant text[] := array[
    'accept_instructor_offer(uuid)',
    'admin_set_tax_id(uuid,text,text)',
    'assess_student_kite_level(uuid,lesson_level)',
    'assign_booking_meeting_point(uuid,uuid)',
    'block_my_time(timestamp with time zone,timestamp with time zone,text)',
    'booking_balance_minutes(uuid)',
    'cancel_admin_test_lesson(uuid)',
    'chat_can_read_booking(uuid)',
    'chat_upload_owned(text,boolean)',
    'close_booking_balance(uuid)',
    'complete_meeting_with_skills(uuid,integer,integer[],integer[])',
    'confirm_test_payment(uuid)',
    'confirm_validation_lesson(uuid)',
    'create_admin_test_booking(uuid,uuid,uuid,jsonb)',
    'create_admin_test_lesson(uuid,uuid,uuid,timestamp with time zone,integer)',
    'create_beach(text,text)',
    'create_booking(uuid,lesson_level,text,jsonb,text,boolean)',
    'create_instructor_request(uuid,lesson_level,text,jsonb,text,boolean)',
    'create_instructor_request_with_preference(uuid,lesson_level,text,jsonb,text,boolean,uuid)',
    'create_meeting_point(uuid,text,text,numeric,numeric)',
    'current_app_role()',
    'decline_instructor_offer(uuid)',
    'discard_my_chat_upload(uuid)',
    'get_admin_instructor_avatar_paths()',
    'get_admin_partner_avatar_paths()',
    'get_instructor_profile_progress(uuid)',
    'get_my_booking_instructor_avatar(uuid)',
    'get_my_instructor_student_avatar_paths()',
    'get_partner_admin_details(uuid)',
    'get_partner_profile_progress(uuid)',
    'instructor_can_read_student_avatar(text)',
    'interrupt_meeting(uuid,text,integer,integer,integer[],integer[])',
    'is_admin()',
    'mark_my_booking_chat_read(uuid,uuid)',
    'mark_my_notification_read(uuid)',
    'my_booking_reassignment_offers()',
    'my_instructor_request_quote(uuid)',
    'partner_summary()',
    'prepare_chat_attachment(uuid,text,text,integer)',
    'publish_level_price_version(integer,integer,integer,integer,integer,text,bigint)',
    'publish_price_version(integer,integer,integer,text)',
    'quote_preview(integer)',
    'quote_table()',
    'quote_table_by_level()',
    'rate_completed_booking(uuid,integer,text)',
    'read_my_offer_suggestion(uuid)',
    'record_meeting(uuid,integer,text)',
    'record_meeting_with_skills(uuid,integer,integer[],integer[])',
    'refresh_instructor_request(uuid)',
    'register_my_document(text,text,text)',
    'register_partner(text,uuid)',
    'release_my_booking(uuid,text)',
    'report_lesson_incident(uuid,uuid,text,integer,text)',
    'request_balance_meeting(uuid,timestamp with time zone,integer)',
    'request_meeting_change(uuid,timestamp with time zone,text)',
    'resolve_student_change(uuid,text)',
    'respond_balance_meeting(uuid,boolean)',
    'respond_booking_reassignment(uuid,boolean)',
    'respond_meeting_change(uuid,boolean)',
    'respond_to_offer_suggestion(uuid,boolean)',
    'review_instructor_document(uuid,text,text)',
    'review_lesson_incident(uuid,text,text)',
    'save_commercial_policy_draft(integer,text,text,text)',
    'save_my_schedule(integer[],time without time zone,time without time zone,integer)',
    'schedule_meeting_resume(uuid,timestamp with time zone)',
    'send_booking_message(uuid,text)',
    'send_chat_attachment(uuid)',
    'send_chat_location(uuid,double precision,double precision)',
    'set_instructor_commission(uuid,integer,text)',
    'set_instructor_status(uuid,instructor_status,text)',
    'set_meeting_point_active(uuid,boolean)',
    'set_my_beaches(uuid[])',
    'set_my_chat_visibility(boolean)',
    'set_my_kite_level(lesson_level)',
    'set_my_partner_avatar(text)',
    'set_my_tax_id(text)',
    'set_partner_commission(uuid,integer,text)',
    'set_partner_status(uuid,partner_status,text)',
    'simulate_test_payment(uuid,text,text)',
    'start_ordered_meeting(uuid,text)',
    'student_can_read_instructor_avatar(text)',
    'suggest_instructor_dates(uuid,jsonb)',
    'touch_my_chat_presence()',
    'unblock_my_time(uuid)',
    'update_beach(uuid,text,text,boolean)',
    'update_my_partner_profile(text,uuid,text,text,text,text,text)'
  ];
begin
  -- A. SECURITY DEFINER sem search_path fixo
  select string_agg(p.oid::regprocedure::text, ', ') into v from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  assert v is null, 'SECURITY DEFINER sem search_path fixo: ' || v;

  -- B. funções de gatilho (qualquer segurança) sem search_path fixo
  select string_agg(p.oid::regprocedure::text, ', ') into v from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  assert v is null, 'função de gatilho sem search_path fixo: ' || v;

  -- C. anon só executa o permitido; e nenhuma SECURITY DEFINER é executável por PUBLIC por omissão (proacl nulo = PUBLIC)
  select string_agg(p.oid::regprocedure::text, ', ') into v from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
    and has_function_privilege('anon', p.oid, 'EXECUTE') and p.oid::regprocedure::text <> all (anon_ok);
  assert v is null, 'anon executa SECURITY DEFINER fora da lista: ' || v;
  select string_agg(p.oid::regprocedure::text, ', ') into v from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.proacl is null;
  assert v is null, 'SECURITY DEFINER com ACL padrão (PUBLIC executa): ' || v;

  -- D. start_meeting negada a todos; start_ordered_meeting só a authenticated (privilégio e chamada efetiva)
  assert not has_function_privilege('anon', 'public.start_meeting(uuid,text)', 'EXECUTE') and not has_function_privilege('authenticated', 'public.start_meeting(uuid,text)', 'EXECUTE'), 'start_meeting deve estar fechada';
  assert has_function_privilege('authenticated', 'public.start_ordered_meeting(uuid,text)', 'EXECUTE') and not has_function_privilege('anon', 'public.start_ordered_meeting(uuid,text)', 'EXECUTE'), 'start_ordered_meeting só authenticated';
  r := pg_temp.try('select public.start_meeting(gen_random_uuid(), ''0000'')', 'authenticated');
  assert r like '42501:permission denied%', 'chamada direta de start_meeting como authenticated deve dar permission denied: ' || r;
  r := pg_temp.try('select public.start_meeting(gen_random_uuid(), ''0000'')', 'anon');
  assert r like '42501:permission denied%', 'chamada direta de start_meeting como anon deve dar permission denied: ' || r;
  r := pg_temp.try('select public.start_ordered_meeting(gen_random_uuid(), ''0000'')', 'anon');
  assert r like '42501:permission denied%', 'start_ordered_meeting como anon deve dar permission denied: ' || r;
  r := pg_temp.try('select public.start_ordered_meeting(gen_random_uuid(), ''0000'')', 'authenticated');
  assert r not like '42501:permission denied%', 'start_ordered_meeting precisa ser alcançável por authenticated (a recusa deve vir da regra, não do privilégio): ' || r;

  -- E. notify_*: não executáveis por ninguém da API, 1 gatilho ligado a cada uma
  for v in select unnest(array['notify_booking_message', 'notify_confirmed_booking', 'notify_lesson_incident', 'notify_offer_transition']) loop
    assert not has_function_privilege('anon', format('public.%I()', v)::regprocedure, 'EXECUTE') and not has_function_privilege('authenticated', format('public.%I()', v)::regprocedure, 'EXECUTE'), v || ' deve estar fechada';
    assert (select count(*) from pg_trigger t where t.tgfoid = format('public.%I()', v)::regprocedure and not t.tgisinternal and t.tgenabled = 'O') = 1, v || ' deve ter exatamente 1 gatilho ligado';
    r := pg_temp.try(format('select public.%I()', v), 'authenticated');
    assert r like '42501:permission denied%', v || ' direta como authenticated deve dar permission denied: ' || r;
  end loop;

  -- F. 4 funções de gatilho com search_path FIXO e gatilho ligado
  for v in select unnest(array['bookings_snapshot_frozen', 'touch_updated_at', 'reject_change', 'reject_test_payment']) loop
    assert exists (select 1 from pg_proc p where p.oid = format('public.%I()', v)::regprocedure and (p.proconfig @> array['search_path=""'] or p.proconfig @> array['search_path=pg_catalog'])), v || ': search_path fixo esperado';
    assert (select count(*) from pg_trigger t where t.tgfoid = format('public.%I()', v)::regprocedure and not t.tgisinternal) >= 1, v || ' perdeu o gatilho';
  end loop;
  -- funções de gatilho executáveis pela API: só as decididas (INVOKER; chamada direta falha com "trigger functions can only be called as triggers")
  select string_agg(p.oid::regprocedure::text, ', ') into v from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype
    and p.prosecdef and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  assert v is null, 'função de gatilho SECURITY DEFINER executável pela API: ' || v;

  -- G. internos fechados (qualquer função cujo nome indica auxiliar interno ou guarda)
  select string_agg(p.oid::regprocedure::text, ', ') into v from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('save_meeting_steps', 'assert_valid_meeting_steps', 'guard_interrupted_meeting_completion', 'guard_student_meeting_overlap', 'can_move_meeting',
                      'student_has_meeting_overlap', 'run_expiry_jobs', 'run_queue_expiry_job', 'advance_instructor_offer', 'write_audit')
    and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  assert v is null, 'auxiliar interno executável pela API: ' || v;

  -- H. RLS em toda tabela de public; escrita direta de cliente só na lista decidida
  select string_agg(c.relname, ', ') into v from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity;
  assert v is null, 'tabela sem RLS: ' || v;
  select string_agg(x, ', ') into v from (select grantee || ' ' || table_name as x from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
    group by grantee, table_name) g where x <> all (write_ok);
  assert v is null, 'escrita direta de cliente fora da lista: ' || v;

  -- I. cada SECURITY DEFINER que authenticated executa tem verificação de papel/dono (ou está na lista decidida)
  select string_agg(p.oid::regprocedure::text, ', ') into v from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'EXECUTE') and p.oid::regprocedure::text <> all (no_check_ok)
    and p.prosrc !~* '(require_role|auth\.uid\(\)|is_admin\(\)|current_app_role|auth\.jwt|require_admin|require_chat_booking|request\.jwt)';
  assert v is null, 'SECURITY DEFINER de authenticated sem verificação de papel/dono: ' || v;

  -- J. inventário fechado da superfície
  select string_agg(x, ', ') into v from (select p.oid::regprocedure::text as x from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')) a where x <> all (inventory);
  assert v is null, 'NOVA função SECURITY DEFINER executável por authenticated (decida e acrescente ao inventário): ' || v;
  select string_agg(x, ', ') into v from unnest(inventory) x where x <> all (array(select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE')));
  assert v is null, 'função do inventário sumiu ou perdeu o EXECUTE de authenticated: ' || v;
end $$;
rollback;
select 'PASS: auditoria de RPCs (search_path, anon, start_meeting/start_ordered_meeting, notify_*, gatilhos, RLS, verificação de dono, inventário fechado)' as result;
