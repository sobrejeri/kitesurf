-- Verificação SOMENTE LEITURA da migration 20261116100000_business_public_store (fase 7: vitrine pública).
-- Rode DEPOIS das fases 1 a 7. Não cria, altera nem apaga nada. Copie as saídas como estão.
-- ESTA FASE EXPÕE FUNÇÕES AO ANONIMO (visitante sem conta): os blocos [3] e [4] são os mais importantes.

-- [1] Funções novas. ESPERADO: 12 linhas, todas definer = true e search_path_fixo = true
--     (company_public_limits aparece com definer = false: função pura de constantes).
select p.proname as funcao, p.prosecdef as definer, exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') as search_path_fixo
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('company_place_order','company_public_limits','company_slot_ok','company_published_id','set_store_public','public_store_list',
  'public_store_catalog','public_free_slots','create_public_order','get_public_order','cancel_public_order','my_orders') order by 1;

-- [2] O QUE O ANONIMO EXECUTA. ESPERADO: exatamente 6 linhas:
--     cancel_public_order, create_public_order, get_public_order, public_free_slots, public_store_catalog, public_store_list.
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
  and (p.proname in ('company_place_order','company_public_limits','company_slot_ok','company_published_id','set_store_public','public_store_list','public_store_catalog','public_free_slots',
        'create_public_order','get_public_order','cancel_public_order','my_orders','create_order') or p.proname like 'company\_%' or p.proname like 'set\_%' or p.proname like 'record\_%')
  order by 1;

-- [3] O anonimo NÃO tem nenhum acesso direto a tabela do Business. ESPERADO: 0 linhas.
select table_name, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon' and (table_name like 'company\_%' or table_name = 'companies');

-- [4] Funções internas sem EXECUTE para anon e authenticated. ESPERADO: 4 linhas, todas false e false.
select p.proname as funcao, has_function_privilege('anon', p.oid, 'EXECUTE') as anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('company_place_order','company_public_limits','company_slot_ok','company_published_id') order by 1;

-- [5] Colunas novas. ESPERADO: company_orders.customer_id e public_token_hash; company_store_settings.public_slug e published (padrão false).
select table_name, column_name, is_nullable, column_default from information_schema.columns
where table_schema = 'public' and ((table_name = 'company_orders' and column_name in ('customer_id','public_token_hash','created_by'))
  or (table_name = 'company_store_settings' and column_name in ('public_slug','published'))) order by 1, 2;

-- [6] Nenhuma loja publicada por padrão. ESPERADO: 0 (uma loja só aparece quando a escola publica de propósito).
select count(*) as lojas_publicadas from public.company_store_settings where published;

-- [7] Limites contra abuso. ESPERADO: 3 por telefone/hora, 10 por telefone/dia, 60 por empresa/hora, 300 em aberto, 10 itens.
select * from public.company_public_limits();

-- [8] A create_order da equipe continua exigindo permissão por unidade e agora chama o núcleo. ESPERADO: true, true.
select pg_get_functiondef('public.create_order(uuid,text,text,public.company_order_origin,jsonb,text,text)'::regprocedure) like '%company_place_order%' as chama_o_nucleo,
       pg_get_functiondef('public.company_place_order(uuid,text,text,public.company_order_origin,jsonb,text,text,boolean,uuid,text)'::regprocedure) like '%require_company_permission(v_unit, ''shop.edit'')%' as nucleo_exige_permissao_da_equipe;

-- [9] Nenhum pedido público ainda. ESPERADO: 0.
select count(*) as pedidos_publicos from public.company_orders where created_by is null;

-- [10] Comportamento sem gravar nada, como VISITANTE. ESPERADO:
--      a) public_store_list devolve 0 linhas; b) o catálogo de um endereço que não existe falha com "Store not available";
--      c) ler a tabela de pedidos falha com "permission denied for table company_orders"; d) chamar a função da equipe falha por permissão.
begin;
  set local role anon;
  select count(*) as lojas_visiveis from public.public_store_list();
rollback;
begin;
  set local role anon;
  select public.public_store_catalog('nao-existe');
rollback;
begin;
  set local role anon;
  select count(*) from public.company_orders;
rollback;
begin;
  set local role anon;
  select public.create_order('00000000-0000-0000-0000-000000000000', 'Teste', '88999990000', 'vitrine', '[]'::jsonb);
rollback;
