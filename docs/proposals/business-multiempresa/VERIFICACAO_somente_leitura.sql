-- Verificação SOMENTE LEITURA da migration 20261115120000_business_company_core.
-- Não cria, altera nem apaga nada. Rode no editor SQL do Supabase DEPOIS de aplicar a migration.
-- Cada bloco diz o resultado esperado. Copie as saídas como estão.

-- [1] RLS ligada nas 13 tabelas novas. ESPERADO: 13 linhas, todas com rls = true.
select c.relname as tabela, c.relrowsecurity as rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and (c.relname like 'company\_%' or c.relname = 'companies')
order by 1;

-- [2] Escrita direta por cliente. ESPERADO: 0 linhas.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and (table_name like 'company\_%' or table_name = 'companies')
  and grantee in ('anon', 'authenticated') and privilege_type <> 'SELECT';

-- [3] Leitura por anon nas tabelas novas. ESPERADO: 0 linhas.
select table_name from information_schema.role_table_grants
where table_schema = 'public' and (table_name like 'company\_%' or table_name = 'companies') and grantee = 'anon';

-- [4] Funções novas: todas definer com search_path fixo. ESPERADO: 19 linhas, definer = true, search_path_fixo = true.
select p.proname as funcao, p.prosecdef as definer,
       exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') as search_path_fixo
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('auth_email','company_has_permission','company_any_permission','company_ids','company_unit_ids',
  'require_company_permission','company_audit','create_company','admin_set_company_status','create_unit','update_unit','invite_staff',
  'invite_instructor','accept_company_invitation','decline_company_invitation','set_member_unit_role','set_member_override',
  'set_instructor_link_status','set_instructor_rate')
order by 1;

-- [5] Execução por anon. ESPERADO: 0 linhas (anon não executa nenhuma função nova).
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')
  and p.proname in ('auth_email','company_has_permission','company_any_permission','company_ids','company_unit_ids','require_company_permission','company_audit',
  'create_company','admin_set_company_status','create_unit','update_unit','invite_staff','invite_instructor','accept_company_invitation',
  'decline_company_invitation','set_member_unit_role','set_member_override','set_instructor_link_status','set_instructor_rate');

-- [6] Funções internas sem EXECUTE para usuários logados. ESPERADO: 2 linhas, ambas com executa_authenticated = false.
select p.proname as funcao, has_function_privilege('authenticated', p.oid, 'EXECUTE') as executa_authenticated
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('company_audit', 'require_company_permission') order by 1;

-- [7] Gatilhos que impedem editar ou apagar auditoria e versões de comissão. ESPERADO: 2 linhas.
select tgname, tgrelid::regclass as tabela from pg_trigger
where tgname in ('company_audit_append_only', 'company_instructor_rates_append_only') and not tgisinternal order by 1;

-- [8] Catálogo de permissões. ESPERADO: 12 permissões e 19 ligações cargo-permissão.
select (select count(*) from public.company_permissions) as permissoes, (select count(*) from public.company_role_permissions) as cargo_permissoes;

-- [9] Valores do enum de cargo. ESPERADO: manager, finance, attendant (NÃO pode haver "owner" nem "admin").
select e.enumlabel as cargo from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'company_role' order by e.enumsortorder;

-- [10] Nenhum dado de empresa ainda. ESPERADO: 0 e 0 (a migration só cria estrutura).
select (select count(*) from public.companies) as empresas, (select count(*) from public.company_audit_logs) as auditoria;

-- [11] Teste de comportamento sem gravar nada (cada um dentro de transação desfeita).
-- ESPERADO: o primeiro falha com "permission denied for function create_company"; o segundo devolve 0.
-- No editor do Supabase, rode um bloco de cada vez; o erro do primeiro é o resultado esperado.
begin;
  set local role anon;
  select public.create_company('Teste Ltda', 'Teste', '11222333000181');
rollback;
begin;
  set local role authenticated;
  select count(*) as linhas_visiveis_sem_login from public.companies;
rollback;
