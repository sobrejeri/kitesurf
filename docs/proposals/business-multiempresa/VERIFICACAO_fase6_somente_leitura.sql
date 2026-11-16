-- Verificação SOMENTE LEITURA da migration 20261115170000_business_finance (fase 6).
-- Rode DEPOIS das fases 1 a 6. Não cria, altera nem apaga nada. Copie as saídas como estão.

-- [1] RLS nas 4 tabelas novas. ESPERADO: 4 linhas, todas rls = true.
select c.relname as tabela, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('company_fin_entries','company_dues','company_due_payments','company_instructor_payments') order by 1;

-- [2] Escrita direta por cliente ou leitura por anon. ESPERADO: 0 linhas.
select grantee, table_name, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('company_fin_entries','company_dues','company_due_payments','company_instructor_payments')
  and ((grantee = 'authenticated' and privilege_type <> 'SELECT') or grantee = 'anon');

-- [3] Funções novas. ESPERADO: 18 linhas. 15 com definer = true e search_path_fixo = true; company_dues_guard,
--     company_instructor_payments_guard e company_due_status com definer = false (gatilhos e função pura): esperado.
select p.proname as funcao, p.prosecdef as definer, exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') as search_path_fixo
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('company_dues_guard','company_due_payment_guard','company_instructor_payments_guard','company_instructor_payment_guard','company_instructor_due_cents',
  'company_instructor_paid_cents','record_fin_entry','reverse_fin_entry','create_due','record_due_payment','cancel_due','record_instructor_payment','confirm_instructor_payment',
  'void_instructor_payment','instructor_balance','my_company_earnings','company_due_status','company_finance_summary') order by 1;

-- [4] anon não executa nenhuma função nova. ESPERADO: 0 linhas.
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
  and p.proname in ('company_instructor_due_cents','company_instructor_paid_cents','record_fin_entry','reverse_fin_entry','create_due','record_due_payment','cancel_due','record_instructor_payment',
  'confirm_instructor_payment','void_instructor_payment','instructor_balance','my_company_earnings','company_due_status','company_finance_summary');

-- [5] Internas sem EXECUTE para usuário logado. ESPERADO: 2 linhas, ambas false.
select p.proname as funcao, has_function_privilege('authenticated', p.oid, 'EXECUTE') as executa_authenticated from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('company_instructor_due_cents','company_instructor_paid_cents') order by 1;

-- [6] Gatilhos de proteção. ESPERADO: 8 linhas.
select tgname, tgrelid::regclass as tabela from pg_trigger
where tgname in ('company_fin_entries_append_only','company_dues_frozen','company_dues_no_delete','company_due_payments_within','company_due_payments_append_only',
  'company_instructor_payments_frozen','company_instructor_payments_no_delete','company_instructor_payments_within') and not tgisinternal order by 1;

-- [7] Restrições. ESPERADO: 4 linhas.
select conname from pg_constraint where conname in ('company_fin_entries_sign','company_dues_cancel_consistent','company_instructor_payments_void_consistent','company_instructor_payments_not_both') order by 1;

-- [8] Formas de pagamento aceitas no registro. ESPERADO: a restrição lista só pix, ted e cash (registro de pagamento feito FORA do VentoKite).
select pg_get_constraintdef(oid) as formas from pg_constraint where conrelid = 'public.company_instructor_payments'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%pix%';

-- [9] Permissão nova. ESPERADO: finance.edit, sensitive = true, 1 cargo (finance).
select id, sensitive, (select count(*) from public.company_role_permissions rp where rp.permission = p.id) as cargos from public.company_permissions p where id = 'finance.edit';

-- [10] Nenhum dado ainda. ESPERADO: 0, 0, 0.
select (select count(*) from public.company_fin_entries) as lancamentos, (select count(*) from public.company_dues) as contas, (select count(*) from public.company_instructor_payments) as pagamentos;

-- [11] Comportamento sem gravar nada. ESPERADO: o primeiro falha com "permission denied for function my_company_earnings"; o segundo devolve 0.
begin;
  set local role anon;
  select * from public.my_company_earnings();
rollback;
begin;
  set local role authenticated;
  select count(*) as pagamentos_visiveis_sem_login from public.company_instructor_payments;
rollback;
