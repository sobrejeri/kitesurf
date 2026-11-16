-- Verificação SOMENTE LEITURA da migration 20261115150000_business_cash (fase 4).
-- Rode DEPOIS das fases 1, 2, 3 e 4. Não cria, altera nem apaga nada. Copie as saídas como estão.

-- [1] RLS nas 4 tabelas novas. ESPERADO: 4 linhas, todas rls = true.
select c.relname as tabela, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('company_cash_settings','company_cash_sessions','company_cash_movements','company_cash_closing_files') order by 1;

-- [2] Escrita direta por cliente ou leitura por anon. ESPERADO: 0 linhas.
select grantee, table_name, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('company_cash_settings','company_cash_sessions','company_cash_movements','company_cash_closing_files')
  and ((grantee = 'authenticated' and privilege_type <> 'SELECT') or grantee = 'anon');

-- [3] Funções novas. ESPERADO: 14 linhas. 13 com definer = true e search_path_fixo = true;
--     company_cash_sessions_guard aparece com definer = false (função de gatilho): isso é esperado.
select p.proname as funcao, p.prosecdef as definer, exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') as search_path_fixo
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('company_cash_sessions_guard','company_cash_movement_guard','company_cash_expected','company_cash_lock','company_closing_object_access',
  'set_cash_settings','open_cash_session','record_cash_movement','sell_product','record_booking_payment','record_rental_payment','close_cash_session','register_closing_file','cash_session_totals') order by 1;

-- [4] anon não executa nenhuma função nova. ESPERADO: 0 linhas.
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
  and p.proname in ('company_cash_expected','company_cash_lock','company_closing_object_access','set_cash_settings','open_cash_session','record_cash_movement',
  'sell_product','record_booking_payment','record_rental_payment','close_cash_session','register_closing_file','cash_session_totals');

-- [5] Internas sem EXECUTE para usuário logado. ESPERADO: 2 linhas, ambas false.
select p.proname as funcao, has_function_privilege('authenticated', p.oid, 'EXECUTE') as executa_authenticated from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('company_cash_expected','company_cash_lock') order by 1;

-- [6] Bucket privado. ESPERADO: 1 linha, public = false, limite 5242880, tipos pdf e xlsx.
select id, public, file_size_limit, array_to_string(allowed_mime_types, ', ') as tipos from storage.buckets where id = 'vento-business-closings';

-- [7] Políticas do bucket. ESPERADO: 2 linhas (SELECT e INSERT) só para authenticated; NENHUMA de UPDATE ou DELETE.
select policyname, cmd, roles from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'vento_business_closings%' order by 1;

-- [8] Gatilhos de proteção. ESPERADO: 5 linhas.
select tgname, tgrelid::regclass as tabela from pg_trigger
where tgname in ('company_cash_sessions_frozen','company_cash_sessions_no_delete','company_cash_movements_open_only','company_cash_movements_append_only','company_cash_closing_files_append_only') and not tgisinternal order by 1;

-- [9] Restrições e índices que garantem as regras. ESPERADO: 7 linhas.
select 'um caixa aberto por unidade' as regra, indexname as nome from pg_indexes where indexname = 'company_cash_one_open'
union all select 'fechamento consistente', conname from pg_constraint where conname = 'company_cash_closed_consistent'
union all select 'diferença exige motivo', conname from pg_constraint where conname = 'company_cash_difference_reason'
union all select 'venda com origem do banco', conname from pg_constraint where conname = 'company_cash_sale_origin'
union all select 'reserva recebida uma vez', conname from pg_constraint where conrelid = 'public.company_cash_movements'::regclass and contype = 'u' and pg_get_constraintdef(oid) like '%external_booking_id%'
union all select 'aluguel recebido uma vez', conname from pg_constraint where conrelid = 'public.company_cash_movements'::regclass and contype = 'u' and pg_get_constraintdef(oid) like '%rental_id%'
union all select 'um arquivo por tipo', conname from pg_constraint where conrelid = 'public.company_cash_closing_files'::regclass and contype = 'u' and pg_get_constraintdef(oid) like '%session_id, kind%';

-- [10] Nenhum dado ainda. ESPERADO: 0, 0, 0.
select (select count(*) from public.company_cash_sessions) as caixas, (select count(*) from public.company_cash_movements) as movimentos, (select count(*) from public.company_cash_closing_files) as arquivos;

-- [11] Comportamento sem gravar nada. ESPERADO: o primeiro falha com "permission denied for function open_cash_session"; o segundo devolve 0.
begin;
  set local role anon;
  select public.open_cash_session('00000000-0000-0000-0000-000000000000', 0, 'Teste');
rollback;
begin;
  set local role authenticated;
  select count(*) as caixas_visiveis_sem_login from public.company_cash_sessions;
rollback;
