-- Verificação SOMENTE LEITURA da migration 20261115140000_business_stock_rentals (fase 3).
-- Rode DEPOIS das fases 1 e 2 e da fase 3. Não cria, altera nem apaga nada. Copie as saídas como estão.

-- [1] RLS nas 7 tabelas novas. ESPERADO: 7 linhas, todas rls = true.
select c.relname as tabela, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('company_products','company_stock_balances','company_stock_movements','company_equipment','company_rental_rates','company_rentals','company_maintenance') order by 1;

-- [2] Escrita direta por cliente ou leitura por anon. ESPERADO: 0 linhas.
select grantee, table_name, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('company_products','company_stock_balances','company_stock_movements','company_equipment','company_rental_rates','company_rentals','company_maintenance')
  and ((grantee = 'authenticated' and privilege_type <> 'SELECT') or grantee = 'anon');

-- [3] Funções novas. ESPERADO: 14 linhas. 12 com definer = true e search_path_fixo = true; company_rentals_frozen e
--     company_condition_rank aparecem com definer = false (função de gatilho e função pura): isso é esperado.
select p.proname as funcao, p.prosecdef as definer, exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') as search_path_fixo
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('company_stock_apply','company_rentals_frozen','company_equipment_status','company_condition_rank','create_product','record_stock_movement',
  'transfer_stock','create_equipment','set_rental_rate','start_rental','return_rental','open_maintenance','close_maintenance','retire_equipment') order by 1;

-- [4] anon não executa nenhuma função nova. ESPERADO: 0 linhas.
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
  and p.proname in ('create_product','record_stock_movement','transfer_stock','create_equipment','set_rental_rate','start_rental','return_rental','open_maintenance','close_maintenance','retire_equipment','company_equipment_status');

-- [5] Internas sem EXECUTE para usuário logado. ESPERADO: 1 linha com executa_authenticated = false.
select p.proname as funcao, has_function_privilege('authenticated', p.oid, 'EXECUTE') as executa_authenticated from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'company_equipment_status';

-- [6] Gatilhos de proteção. ESPERADO: 5 linhas.
select tgname, tgrelid::regclass as tabela from pg_trigger
where tgname in ('company_stock_movements_apply','company_stock_movements_append_only','company_rental_rates_append_only','company_rentals_snapshot_frozen','company_rentals_no_delete') and not tgisinternal order by 1;

-- [7] Restrições e índices que garantem as regras. ESPERADO: 5 linhas.
select 'saldo nunca negativo' as regra, conname as nome from pg_constraint where conrelid = 'public.company_stock_balances'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%qty >= 0%'
union all select 'sinal do razão', conname from pg_constraint where conname = 'company_stock_sign'
union all select 'um aluguel ativo por equipamento', indexname from pg_indexes where indexname = 'company_rentals_one_active'
union all select 'uma manutenção aberta por equipamento', indexname from pg_indexes where indexname = 'company_maintenance_one_open'
union all select 'devolução consistente', conname from pg_constraint where conname = 'company_rentals_return_consistent';

-- [8] Permissões novas no catálogo. ESPERADO: stock.view false, stock.edit false, stock.adjust true; e 6 ligações cargo-permissão.
select id, sensitive, (select count(*) from public.company_role_permissions rp where rp.permission = p.id) as cargos from public.company_permissions p where id like 'stock.%' order by 1;

-- [9] Nenhum dado ainda. ESPERADO: 0 em tudo.
select (select count(*) from public.company_products) as produtos, (select count(*) from public.company_stock_movements) as movimentacoes,
       (select count(*) from public.company_equipment) as equipamentos, (select count(*) from public.company_rentals) as alugueis;

-- [10] Comportamento sem gravar nada. ESPERADO: o primeiro falha com "permission denied for function start_rental"; o segundo devolve 0.
begin;
  set local role anon;
  select public.start_rental('00000000-0000-0000-0000-000000000000', 'Teste', 1);
rollback;
begin;
  set local role authenticated;
  select count(*) as saldos_visiveis_sem_login from public.company_stock_balances;
rollback;
