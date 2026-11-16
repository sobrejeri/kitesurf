-- Verificação SOMENTE LEITURA da migration 20261115160000_business_shop_affiliates (fase 5).
-- Rode DEPOIS das fases 1 a 5. Não cria, altera nem apaga nada. Copie as saídas como estão.

-- [1] RLS nas 11 tabelas novas. ESPERADO: 11 linhas, todas rls = true.
select c.relname as tabela, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('company_affiliate_links','company_affiliate_requests','company_affiliate_rates','company_affiliate_selections','company_campaigns',
  'company_campaign_items','company_store_settings','company_coupons','company_coupon_units','company_orders','company_order_items') order by 1;

-- [2] Escrita direta por cliente ou leitura por anon. ESPERADO: 0 linhas.
select grantee, table_name, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('company_affiliate_links','company_affiliate_requests','company_affiliate_rates','company_affiliate_selections','company_campaigns',
  'company_campaign_items','company_store_settings','company_coupons','company_coupon_units','company_orders','company_order_items')
  and ((grantee = 'authenticated' and privilege_type <> 'SELECT') or grantee = 'anon');

-- [3] Funções novas. ESPERADO: 21 linhas. 18 com definer = true e search_path_fixo = true; company_orders_frozen,
--     company_order_commission_cents e company_order_commission_state com definer = false (gatilho e funções puras): esperado.
select p.proname as funcao, p.prosecdef as definer, exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') as search_path_fixo
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('company_orders_frozen','company_my_partner_id','company_affiliate_rate_bps','company_is_offer','company_order_commission_cents','company_order_commission_state',
  'company_order_can','set_store_settings','create_coupon','set_coupon_active','create_order','set_order_status','cancel_order','record_order_refund','request_company_affiliation',
  'decide_affiliate_request','set_affiliate_link_status','set_affiliate_rate','set_my_affiliate_selection','create_campaign','my_affiliate_sales') order by 1;

-- [4] anon não executa nenhuma função nova. ESPERADO: 0 linhas.
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
  and p.proname in ('company_my_partner_id','company_affiliate_rate_bps','company_is_offer','company_order_commission_cents','company_order_commission_state','company_order_can','set_store_settings',
  'create_coupon','set_coupon_active','create_order','set_order_status','cancel_order','record_order_refund','request_company_affiliation','decide_affiliate_request','set_affiliate_link_status',
  'set_affiliate_rate','set_my_affiliate_selection','create_campaign','my_affiliate_sales');

-- [5] Internas sem EXECUTE para usuário logado. ESPERADO: 2 linhas, ambas false.
select p.proname as funcao, has_function_privilege('authenticated', p.oid, 'EXECUTE') as executa_authenticated from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('company_affiliate_rate_bps','company_is_offer') order by 1;

-- [6] Situações do pedido. ESPERADO: received, confirmed, ready, delivered, cancelled (NÃO pode haver "paid" nem "pago").
select e.enumlabel as situacao from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'company_order_status' order by e.enumsortorder;

-- [7] Estados de comissão não incluem "paga". ESPERADO: false.
select pg_get_functiondef('public.company_order_commission_state(public.company_order_status,integer,integer)'::regprocedure) ~* 'paid|paga' as menciona_paga;

-- [8] Gatilhos de proteção. ESPERADO: 4 linhas.
select tgname, tgrelid::regclass as tabela from pg_trigger
where tgname in ('company_orders_snapshot_frozen','company_orders_no_delete','company_order_items_append_only','company_affiliate_rates_append_only') and not tgisinternal order by 1;

-- [9] Restrições que garantem as contas. ESPERADO: 7 linhas.
select conname from pg_constraint where conname in ('company_orders_total','company_orders_refund','company_orders_commission_needs_affiliate','company_order_items_line',
  'company_order_items_discount','company_coupons_used','company_coupons_value') order by 1;

-- [10] Permissões novas. ESPERADO: 5 linhas; shop.manage e affil.manage com sensitive = true.
select id, sensitive, (select count(*) from public.company_role_permissions rp where rp.permission = p.id) as cargos from public.company_permissions p where id like 'shop.%' or id like 'affil.%' order by 1;

-- [11] Nenhum dado ainda. ESPERADO: 0, 0, 0.
select (select count(*) from public.company_orders) as pedidos, (select count(*) from public.company_coupons) as cupons, (select count(*) from public.company_affiliate_links) as vinculos;

-- [12] Comportamento sem gravar nada. ESPERADO: o primeiro falha com "permission denied for function my_affiliate_sales"; o segundo devolve 0.
begin;
  set local role anon;
  select * from public.my_affiliate_sales();
rollback;
begin;
  set local role authenticated;
  select count(*) as pedidos_visiveis_sem_login from public.company_orders;
rollback;
