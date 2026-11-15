-- Verificação SOMENTE LEITURA da migration 20261115130000_business_services_bookings (fase 2).
-- Rode DEPOIS da fase 1 e da fase 2. Não cria, altera nem apaga nada. Copie as saídas como estão.

-- [1] RLS nas 6 tabelas novas. ESPERADO: 6 linhas, todas rls = true.
select c.relname as tabela, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('company_services','company_service_prices','company_unit_services','company_unit_service_instructors','company_packages','company_external_bookings') order by 1;

-- [2] Escrita direta ou leitura por anon nas tabelas novas. ESPERADO: 0 linhas.
select grantee, table_name, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('company_services','company_service_prices','company_unit_services','company_unit_service_instructors','company_packages','company_external_bookings')
  and ((grantee = 'authenticated' and privilege_type <> 'SELECT') or grantee = 'anon');

-- [3] Funções novas. ESPERADO: 15 linhas. 14 com definer = true e search_path_fixo = true; a única com definer = false é
--     company_bookings_frozen (função de gatilho comum, sem search_path de definer): isso é esperado.
select p.proname as funcao, p.prosecdef as definer, exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') as search_path_fixo
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('company_bookings_frozen','company_service_price_cents','company_rate_bps','company_instructor_is_free','company_check_slot',
  'create_service','set_service_price','set_unit_service','create_package','set_package_active','create_external_booking','reschedule_external_booking',
  'cancel_external_booking','complete_external_booking','instructor_busy_intervals') order by 1;

-- [4] anon não executa nenhuma função nova. ESPERADO: 0 linhas.
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
  and p.proname in ('company_service_price_cents','company_rate_bps','company_instructor_is_free','company_check_slot','create_service','set_service_price','set_unit_service',
  'create_package','set_package_active','create_external_booking','reschedule_external_booking','cancel_external_booking','complete_external_booking','instructor_busy_intervals');

-- [5] Internas sem EXECUTE para usuário logado. ESPERADO: 4 linhas, todas executa_authenticated = false.
select p.proname as funcao, has_function_privilege('authenticated', p.oid, 'EXECUTE') as executa_authenticated from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('company_service_price_cents','company_rate_bps','company_instructor_is_free','company_check_slot') order by 1;

-- [6] A função do fluxo digital continua interna e com as mesmas propriedades. ESPERADO: 1 linha: definer = true, volatilidade = s (stable), exec_authenticated = false, exec_anon = false.
select prosecdef as definer, provolatile as volatilidade, has_function_privilege('authenticated', oid, 'EXECUTE') as exec_authenticated, has_function_privilege('anon', oid, 'EXECUTE') as exec_anon
from pg_proc where oid = 'public.instructor_can_attend(uuid,jsonb)'::regprocedure;

-- [7] Essa função agora cita as reservas presenciais (única mudança no fluxo digital). ESPERADO: true.
select pg_get_functiondef('public.instructor_can_attend(uuid,jsonb)'::regprocedure) like '%company_external_bookings%' as considera_reservas_presenciais;

-- [8] Gatilhos de proteção. ESPERADO: 3 linhas (valor congelado, sem delete, preço append-only).
select tgname, tgrelid::regclass as tabela from pg_trigger
where tgname in ('company_bookings_snapshot_frozen','company_bookings_no_delete','company_service_prices_append_only') and not tgisinternal order by 1;

-- [9] Restrições que garantem as contas. ESPERADO: 3 linhas.
select conname from pg_constraint where conname in ('company_bookings_split_reconciles','company_bookings_commission_matches_rate','company_bookings_cancel_consistent') order by 1;

-- [10] Nenhum dado ainda. ESPERADO: 0, 0, 0.
select (select count(*) from public.company_services) as servicos, (select count(*) from public.company_service_prices) as precos, (select count(*) from public.company_external_bookings) as reservas;

-- [11] Comportamento sem gravar nada. ESPERADO: o primeiro falha com "permission denied for function create_external_booking"; o segundo devolve 0.
begin;
  set local role anon;
  select public.create_external_booking('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'Teste', '88999990000', now() + interval '2 days');
rollback;
begin;
  set local role authenticated;
  select count(*) as reservas_visiveis_sem_login from public.company_external_bookings;
rollback;
