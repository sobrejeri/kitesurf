-- Business phases 1-7: catalogue/ACL preflight only. No application RPC is called.
-- Optional: SET vento.business.expected_phase = '1' (1..7); default is 7.
-- Run as the SQL owner, without an existing transaction, before and after each phase.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '2s';
SELECT current_setting('transaction_read_only') AS read_only,
       current_database() AS database_name, version() AS postgres_version,
       (SELECT count(*) FROM public.profiles) AS profiles,
       (SELECT count(*) FROM public.bookings) AS bookings;

DO $business_preflight$
DECLARE
  manifest jsonb := $manifest${
    "tables": [
      {"phase":1,"name":"company_permissions"},
      {"phase":1,"name":"company_role_permissions"},
      {"phase":1,"name":"companies"},
      {"phase":1,"name":"company_units"},
      {"phase":1,"name":"company_members"},
      {"phase":1,"name":"company_member_units"},
      {"phase":1,"name":"company_member_overrides"},
      {"phase":1,"name":"company_invitations"},
      {"phase":1,"name":"company_invitation_units"},
      {"phase":1,"name":"company_instructor_links"},
      {"phase":1,"name":"company_instructor_units"},
      {"phase":1,"name":"company_instructor_rates"},
      {"phase":1,"name":"company_audit_logs"},
      {"phase":2,"name":"company_services"},
      {"phase":2,"name":"company_service_prices"},
      {"phase":2,"name":"company_unit_services"},
      {"phase":2,"name":"company_unit_service_instructors"},
      {"phase":2,"name":"company_packages"},
      {"phase":2,"name":"company_external_bookings"},
      {"phase":3,"name":"company_products"},
      {"phase":3,"name":"company_stock_balances"},
      {"phase":3,"name":"company_stock_movements"},
      {"phase":3,"name":"company_equipment"},
      {"phase":3,"name":"company_rental_rates"},
      {"phase":3,"name":"company_rentals"},
      {"phase":3,"name":"company_maintenance"},
      {"phase":4,"name":"company_cash_settings"},
      {"phase":4,"name":"company_cash_sessions"},
      {"phase":4,"name":"company_cash_movements"},
      {"phase":4,"name":"company_cash_closing_files"},
      {"phase":5,"name":"company_affiliate_links"},
      {"phase":5,"name":"company_affiliate_requests"},
      {"phase":5,"name":"company_affiliate_rates"},
      {"phase":5,"name":"company_affiliate_selections"},
      {"phase":5,"name":"company_campaigns"},
      {"phase":5,"name":"company_campaign_items"},
      {"phase":5,"name":"company_store_settings"},
      {"phase":5,"name":"company_coupons"},
      {"phase":5,"name":"company_coupon_units"},
      {"phase":5,"name":"company_orders"},
      {"phase":5,"name":"company_order_items"},
      {"phase":6,"name":"company_fin_entries"},
      {"phase":6,"name":"company_dues"},
      {"phase":6,"name":"company_due_payments"},
      {"phase":6,"name":"company_instructor_payments"}
    ],
    "functions": [
      {"phase":1,"name":"auth_email","args":0,"definer":true,"authenticated":true,"anon":false,"types":[]},
      {"phase":1,"name":"company_has_permission","args":2,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text"]},
      {"phase":1,"name":"company_any_permission","args":2,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text"]},
      {"phase":1,"name":"company_ids","args":0,"definer":true,"authenticated":true,"anon":false,"types":[]},
      {"phase":1,"name":"company_unit_ids","args":0,"definer":true,"authenticated":true,"anon":false,"types":[]},
      {"phase":1,"name":"require_company_permission","args":2,"definer":true,"authenticated":false,"anon":false,"types":["uuid","text"]},
      {"phase":1,"name":"company_audit","args":5,"definer":true,"authenticated":false,"anon":false,"types":["uuid","uuid","text","text","jsonb"]},
      {"phase":1,"name":"create_company","args":3,"definer":true,"authenticated":true,"anon":false,"types":["text","text","text"]},
      {"phase":1,"name":"admin_set_company_status","args":3,"definer":true,"authenticated":true,"anon":false,"types":["uuid","public.company_status","text"]},
      {"phase":1,"name":"create_unit","args":8,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text","text","text","numeric","numeric","time","time"]},
      {"phase":1,"name":"update_unit","args":7,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text","text","text","time","time","boolean"]},
      {"phase":1,"name":"invite_staff","args":3,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text","jsonb"]},
      {"phase":1,"name":"invite_instructor","args":4,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text","uuid[]","integer"]},
      {"phase":1,"name":"accept_company_invitation","args":1,"definer":true,"authenticated":true,"anon":false,"types":["uuid"]},
      {"phase":1,"name":"decline_company_invitation","args":1,"definer":true,"authenticated":true,"anon":false,"types":["uuid"]},
      {"phase":1,"name":"set_member_unit_role","args":3,"definer":true,"authenticated":true,"anon":false,"types":["uuid","uuid","text"]},
      {"phase":1,"name":"set_member_override","args":4,"definer":true,"authenticated":true,"anon":false,"types":["uuid","uuid","text","boolean"]},
      {"phase":1,"name":"set_instructor_link_status","args":3,"definer":true,"authenticated":true,"anon":false,"types":["uuid","public.company_link_status","text"]},
      {"phase":1,"name":"set_instructor_rate","args":3,"definer":true,"authenticated":true,"anon":false,"types":["uuid","uuid","integer"]},
      {"phase":2,"name":"company_bookings_frozen","args":0,"definer":false,"authenticated":false,"anon":false,"types":[]},
      {"phase":2,"name":"company_service_price_cents","args":3,"definer":true,"authenticated":false,"anon":false,"types":["uuid","uuid","date"]},
      {"phase":2,"name":"company_rate_bps","args":3,"definer":true,"authenticated":false,"anon":false,"types":["uuid","uuid","date"]},
      {"phase":2,"name":"company_instructor_is_free","args":4,"definer":true,"authenticated":false,"anon":false,"types":["uuid","timestamptz","integer","uuid"]},
      {"phase":2,"name":"company_check_slot","args":5,"definer":true,"authenticated":false,"anon":false,"types":["uuid","uuid","uuid","timestamptz","uuid"]},
      {"phase":2,"name":"create_service","args":6,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text","integer","integer","text","integer"]},
      {"phase":2,"name":"set_service_price","args":3,"definer":true,"authenticated":true,"anon":false,"types":["uuid","uuid","integer"]},
      {"phase":2,"name":"set_unit_service","args":6,"definer":true,"authenticated":true,"anon":false,"types":["uuid","uuid","text","smallint[]","uuid[]","boolean"]},
      {"phase":2,"name":"create_package","args":5,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text","integer","integer","integer"]},
      {"phase":2,"name":"set_package_active","args":2,"definer":true,"authenticated":true,"anon":false,"types":["uuid","boolean"]},
      {"phase":2,"name":"create_external_booking","args":6,"definer":true,"authenticated":true,"anon":false,"types":["uuid","uuid","uuid","text","text","timestamptz"]},
      {"phase":2,"name":"reschedule_external_booking","args":2,"definer":true,"authenticated":true,"anon":false,"types":["uuid","timestamptz"]},
      {"phase":2,"name":"cancel_external_booking","args":2,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text"]},
      {"phase":2,"name":"complete_external_booking","args":1,"definer":true,"authenticated":true,"anon":false,"types":["uuid"]},
      {"phase":2,"name":"instructor_busy_intervals","args":3,"definer":true,"authenticated":true,"anon":false,"types":["uuid","timestamptz","timestamptz"]},
      {"phase":2,"name":"instructor_can_attend","args":2,"definer":true,"authenticated":false,"anon":false,"types":["uuid","jsonb"]},
      {"phase":3,"name":"company_stock_apply","args":0,"definer":true,"authenticated":false,"anon":false,"types":[]},
      {"phase":3,"name":"company_rentals_frozen","args":0,"definer":false,"authenticated":false,"anon":false,"types":[]},
      {"phase":3,"name":"company_equipment_status","args":1,"definer":true,"authenticated":false,"anon":false,"types":["uuid"]},
      {"phase":3,"name":"company_condition_rank","args":1,"definer":false,"authenticated":false,"anon":false,"types":["public.company_condition"]},
      {"phase":3,"name":"create_product","args":6,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text","text","text","integer","integer"]},
      {"phase":3,"name":"record_stock_movement","args":5,"definer":true,"authenticated":true,"anon":false,"types":["uuid","uuid","text","integer","text"]},
      {"phase":3,"name":"transfer_stock","args":4,"definer":true,"authenticated":true,"anon":false,"types":["uuid","uuid","uuid","integer"]},
      {"phase":3,"name":"create_equipment","args":5,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text","public.company_equipment_type","text","public.company_condition"]},
      {"phase":3,"name":"set_rental_rate","args":3,"definer":true,"authenticated":true,"anon":false,"types":["uuid","public.company_equipment_type","integer"]},
      {"phase":3,"name":"start_rental","args":3,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text","integer"]},
      {"phase":3,"name":"return_rental","args":3,"definer":true,"authenticated":true,"anon":false,"types":["uuid","public.company_condition","text"]},
      {"phase":3,"name":"open_maintenance","args":2,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text"]},
      {"phase":3,"name":"close_maintenance","args":3,"definer":true,"authenticated":true,"anon":false,"types":["uuid","integer","public.company_condition"]},
      {"phase":3,"name":"retire_equipment","args":2,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text"]},
      {"phase":4,"name":"company_cash_sessions_guard","args":0,"definer":false,"authenticated":false,"anon":false,"types":[]},
      {"phase":4,"name":"company_cash_movement_guard","args":0,"definer":true,"authenticated":false,"anon":false,"types":[]},
      {"phase":4,"name":"company_cash_expected","args":1,"definer":true,"authenticated":false,"anon":false,"types":["uuid"]},
      {"phase":4,"name":"company_cash_lock","args":2,"definer":true,"authenticated":false,"anon":false,"types":["uuid","text"]},
      {"phase":4,"name":"company_closing_object_access","args":2,"definer":true,"authenticated":true,"anon":false,"types":["text","boolean"]},
      {"phase":4,"name":"set_cash_settings","args":4,"definer":true,"authenticated":true,"anon":false,"types":["uuid","public.company_closing_mode","integer","text[]"]},
      {"phase":4,"name":"open_cash_session","args":3,"definer":true,"authenticated":true,"anon":false,"types":["uuid","integer","text"]},
      {"phase":4,"name":"record_cash_movement","args":4,"definer":true,"authenticated":true,"anon":false,"types":["uuid","public.company_cash_kind","integer","text"]},
      {"phase":4,"name":"sell_product","args":4,"definer":true,"authenticated":true,"anon":false,"types":["uuid","uuid","integer","public.company_cash_method"]},
      {"phase":4,"name":"record_booking_payment","args":3,"definer":true,"authenticated":true,"anon":false,"types":["uuid","uuid","public.company_cash_method"]},
      {"phase":4,"name":"record_rental_payment","args":3,"definer":true,"authenticated":true,"anon":false,"types":["uuid","uuid","public.company_cash_method"]},
      {"phase":4,"name":"close_cash_session","args":3,"definer":true,"authenticated":true,"anon":false,"types":["uuid","integer","text"]},
      {"phase":4,"name":"register_closing_file","args":4,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text","text","integer"]},
      {"phase":4,"name":"cash_session_totals","args":1,"definer":true,"authenticated":true,"anon":false,"types":["uuid"]},
      {"phase":5,"name":"company_orders_frozen","args":0,"definer":false,"authenticated":false,"anon":false,"types":[]},
      {"phase":5,"name":"company_my_partner_id","args":0,"definer":true,"authenticated":true,"anon":false,"types":[]},
      {"phase":5,"name":"company_affiliate_rate_bps","args":3,"definer":true,"authenticated":false,"anon":false,"types":["uuid","uuid","date"]},
      {"phase":5,"name":"company_is_offer","args":2,"definer":true,"authenticated":false,"anon":false,"types":["uuid","uuid"]},
      {"phase":5,"name":"company_order_commission_cents","args":4,"definer":false,"authenticated":true,"anon":false,"types":["public.company_order_status","integer","integer","integer"]},
      {"phase":5,"name":"company_order_commission_state","args":3,"definer":false,"authenticated":true,"anon":false,"types":["public.company_order_status","integer","integer"]},
      {"phase":5,"name":"company_order_can","args":2,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text"]},
      {"phase":5,"name":"set_store_settings","args":5,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text","text","text","text"]},
      {"phase":5,"name":"create_coupon","args":9,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text","text","integer","integer","integer","integer","uuid[]","uuid"]},
      {"phase":5,"name":"set_coupon_active","args":2,"definer":true,"authenticated":true,"anon":false,"types":["uuid","boolean"]},
      {"phase":5,"name":"create_order","args":7,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text","text","public.company_order_origin","jsonb","text","text"]},
      {"phase":5,"name":"set_order_status","args":2,"definer":true,"authenticated":true,"anon":false,"types":["uuid","public.company_order_status"]},
      {"phase":5,"name":"cancel_order","args":2,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text"]},
      {"phase":5,"name":"record_order_refund","args":3,"definer":true,"authenticated":true,"anon":false,"types":["uuid","integer","text"]},
      {"phase":5,"name":"request_company_affiliation","args":2,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text"]},
      {"phase":5,"name":"decide_affiliate_request","args":3,"definer":true,"authenticated":true,"anon":false,"types":["uuid","boolean","text"]},
      {"phase":5,"name":"set_affiliate_link_status","args":3,"definer":true,"authenticated":true,"anon":false,"types":["uuid","public.company_link_status","text"]},
      {"phase":5,"name":"set_affiliate_rate","args":3,"definer":true,"authenticated":true,"anon":false,"types":["uuid","uuid","integer"]},
      {"phase":5,"name":"set_my_affiliate_selection","args":2,"definer":true,"authenticated":true,"anon":false,"types":["uuid","uuid[]"]},
      {"phase":5,"name":"create_campaign","args":5,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text","text","integer","uuid[]"]},
      {"phase":5,"name":"my_affiliate_sales","args":0,"definer":true,"authenticated":true,"anon":false,"types":[]},
      {"phase":6,"name":"company_dues_guard","args":0,"definer":false,"authenticated":false,"anon":false,"types":[]},
      {"phase":6,"name":"company_due_payment_guard","args":0,"definer":true,"authenticated":false,"anon":false,"types":[]},
      {"phase":6,"name":"company_instructor_payments_guard","args":0,"definer":false,"authenticated":false,"anon":false,"types":[]},
      {"phase":6,"name":"company_instructor_due_cents","args":1,"definer":true,"authenticated":false,"anon":false,"types":["uuid"]},
      {"phase":6,"name":"company_instructor_paid_cents","args":1,"definer":true,"authenticated":false,"anon":false,"types":["uuid"]},
      {"phase":6,"name":"company_instructor_payment_guard","args":0,"definer":true,"authenticated":false,"anon":false,"types":[]},
      {"phase":6,"name":"record_fin_entry","args":6,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text","text","integer","date","text"]},
      {"phase":6,"name":"reverse_fin_entry","args":2,"definer":true,"authenticated":true,"anon":false,"types":["bigint","text"]},
      {"phase":6,"name":"create_due","args":6,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text","text","date","integer","text"]},
      {"phase":6,"name":"record_due_payment","args":4,"definer":true,"authenticated":true,"anon":false,"types":["uuid","integer","date","text"]},
      {"phase":6,"name":"cancel_due","args":2,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text"]},
      {"phase":6,"name":"record_instructor_payment","args":5,"definer":true,"authenticated":true,"anon":false,"types":["uuid","integer","text","text","date"]},
      {"phase":6,"name":"confirm_instructor_payment","args":1,"definer":true,"authenticated":true,"anon":false,"types":["uuid"]},
      {"phase":6,"name":"void_instructor_payment","args":2,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text"]},
      {"phase":6,"name":"instructor_balance","args":1,"definer":true,"authenticated":true,"anon":false,"types":["uuid"]},
      {"phase":6,"name":"my_company_earnings","args":0,"definer":true,"authenticated":true,"anon":false,"types":[]},
      {"phase":6,"name":"company_due_status","args":4,"definer":false,"authenticated":true,"anon":false,"types":["integer","bigint","date","boolean"]},
      {"phase":6,"name":"company_finance_summary","args":3,"definer":true,"authenticated":true,"anon":false,"types":["uuid","date","date"]},
      {"phase":7,"name":"company_place_order","args":10,"definer":true,"authenticated":false,"anon":false,"types":["uuid","text","text","public.company_order_origin","jsonb","text","text","boolean","uuid","text"]},
      {"phase":7,"name":"company_public_limits","args":0,"definer":false,"authenticated":false,"anon":false,"types":[]},
      {"phase":7,"name":"company_slot_ok","args":4,"definer":true,"authenticated":false,"anon":false,"types":["uuid","uuid","uuid","timestamptz"]},
      {"phase":7,"name":"set_store_public","args":3,"definer":true,"authenticated":true,"anon":false,"types":["uuid","text","boolean"]},
      {"phase":7,"name":"public_store_list","args":0,"definer":true,"authenticated":true,"anon":true,"types":[]},
      {"phase":7,"name":"company_published_id","args":1,"definer":true,"authenticated":false,"anon":false,"types":["text"]},
      {"phase":7,"name":"public_store_catalog","args":1,"definer":true,"authenticated":true,"anon":true,"types":["text"]},
      {"phase":7,"name":"public_free_slots","args":5,"definer":true,"authenticated":true,"anon":true,"types":["text","uuid","uuid","uuid","date"]},
      {"phase":7,"name":"create_public_order","args":6,"definer":true,"authenticated":true,"anon":true,"types":["text","text","text","jsonb","text","text"]},
      {"phase":7,"name":"get_public_order","args":2,"definer":true,"authenticated":true,"anon":true,"types":["text","text"]},
      {"phase":7,"name":"cancel_public_order","args":3,"definer":true,"authenticated":true,"anon":true,"types":["text","text","text"]},
      {"phase":7,"name":"my_orders","args":0,"definer":true,"authenticated":true,"anon":false,"types":[]}
    ],
    "triggers": [
      {"phase":1,"name":"company_audit_append_only","table":"company_audit_logs"},
      {"phase":1,"name":"company_instructor_rates_append_only","table":"company_instructor_rates"},
      {"phase":2,"name":"company_bookings_snapshot_frozen","table":"company_external_bookings"},
      {"phase":2,"name":"company_bookings_no_delete","table":"company_external_bookings"},
      {"phase":2,"name":"company_service_prices_append_only","table":"company_service_prices"},
      {"phase":3,"name":"company_stock_movements_apply","table":"company_stock_movements"},
      {"phase":3,"name":"company_stock_movements_append_only","table":"company_stock_movements"},
      {"phase":3,"name":"company_rental_rates_append_only","table":"company_rental_rates"},
      {"phase":3,"name":"company_rentals_snapshot_frozen","table":"company_rentals"},
      {"phase":3,"name":"company_rentals_no_delete","table":"company_rentals"},
      {"phase":4,"name":"company_cash_sessions_frozen","table":"company_cash_sessions"},
      {"phase":4,"name":"company_cash_sessions_no_delete","table":"company_cash_sessions"},
      {"phase":4,"name":"company_cash_movements_open_only","table":"company_cash_movements"},
      {"phase":4,"name":"company_cash_movements_append_only","table":"company_cash_movements"},
      {"phase":4,"name":"company_cash_closing_files_append_only","table":"company_cash_closing_files"},
      {"phase":5,"name":"company_affiliate_rates_append_only","table":"company_affiliate_rates"},
      {"phase":5,"name":"company_order_items_append_only","table":"company_order_items"},
      {"phase":5,"name":"company_orders_snapshot_frozen","table":"company_orders"},
      {"phase":5,"name":"company_orders_no_delete","table":"company_orders"},
      {"phase":6,"name":"company_fin_entries_append_only","table":"company_fin_entries"},
      {"phase":6,"name":"company_dues_frozen","table":"company_dues"},
      {"phase":6,"name":"company_dues_no_delete","table":"company_dues"},
      {"phase":6,"name":"company_due_payments_within","table":"company_due_payments"},
      {"phase":6,"name":"company_due_payments_append_only","table":"company_due_payments"},
      {"phase":6,"name":"company_instructor_payments_frozen","table":"company_instructor_payments"},
      {"phase":6,"name":"company_instructor_payments_no_delete","table":"company_instructor_payments"},
      {"phase":6,"name":"company_instructor_payments_within","table":"company_instructor_payments"}
    ]
  }$manifest$::jsonb;
  phase integer := coalesce(nullif(current_setting('vento.business.expected_phase',true),''),'7')::integer;
  obj jsonb;
  target_oid oid;
  actual_fn record;
  role_name text;
  privilege_name text;
  expected_types oid[];
  required_name text;
  checked_tables integer := 0;
  checked_functions integer := 0;
  checked_triggers integer := 0;
BEGIN
  IF current_setting('transaction_read_only') <> 'on' THEN
    RAISE EXCEPTION 'Business preflight requires a read-only transaction';
  END IF;
  IF phase NOT BETWEEN 1 AND 7 THEN RAISE EXCEPTION 'Expected phase must be 1..7'; END IF;
  FOREACH required_name IN ARRAY ARRAY[
    'tax_id_is_valid','session_has_second_factor','is_admin','require_role','reject_change','write_audit'
  ] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=required_name) THEN
      RAISE EXCEPTION 'Missing prerequisite function: %',required_name;
    END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon')
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    RAISE EXCEPTION 'Missing Supabase client roles';
  END IF;

  FOR obj IN SELECT value FROM jsonb_array_elements(manifest->'tables') LOOP
    IF (obj->>'phase')::integer>phase THEN CONTINUE; END IF;
    target_oid := to_regclass('public.'||(obj->>'name'));
    IF target_oid IS NULL THEN RAISE EXCEPTION 'Phase % missing table %',obj->>'phase',obj->>'name'; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=target_oid AND relkind='r' AND relrowsecurity) THEN
      RAISE EXCEPTION 'Table lacks RLS: %',obj->>'name';
    END IF;
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      FOREACH privilege_name IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF has_table_privilege(role_name,target_oid,privilege_name) THEN
          RAISE EXCEPTION 'Direct table privilege % for % on %',privilege_name,role_name,obj->>'name';
        END IF;
      END LOOP;
      IF has_any_column_privilege(role_name,target_oid,'INSERT,UPDATE,REFERENCES') THEN
        RAISE EXCEPTION 'Direct column write grant for % on %',role_name,obj->>'name';
      END IF;
    END LOOP;
    IF has_any_column_privilege('anon',target_oid,'SELECT')
      OR NOT has_table_privilege('authenticated',target_oid,'SELECT') THEN
      RAISE EXCEPTION 'Unexpected table read grants: %',obj->>'name';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=target_oid AND polcmd='r') THEN
      RAISE EXCEPTION 'Missing SELECT policy: %',obj->>'name';
    END IF;
    checked_tables:=checked_tables+1;
  END LOOP;

  FOR obj IN SELECT value FROM jsonb_array_elements(manifest->'functions') LOOP
    IF (obj->>'phase')::integer>phase THEN CONTINUE; END IF;
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=obj->>'name') <> 1 THEN
      RAISE EXCEPTION 'Missing or ambiguous function: %',obj->>'name';
    END IF;
    SELECT p.* INTO STRICT actual_fn FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=obj->>'name';
    SELECT coalesce(array_agg(to_regtype(type_name)::oid ORDER BY ord),'{}'::oid[])
      INTO expected_types FROM jsonb_array_elements_text(obj->'types') WITH ORDINALITY AS a(type_name,ord);
    IF ARRAY(SELECT unnest(actual_fn.proargtypes)) IS DISTINCT FROM expected_types
      OR actual_fn.pronargs<>(obj->>'args')::integer
      OR actual_fn.prosecdef IS DISTINCT FROM (obj->>'definer')::boolean
      OR NOT coalesce(actual_fn.proconfig,'{}') @> ARRAY['search_path=""'] THEN
      RAISE EXCEPTION 'Unexpected function signature/security/search_path: %',obj->>'name';
    END IF;
    IF has_function_privilege('anon',actual_fn.oid,'EXECUTE') IS DISTINCT FROM (obj->>'anon')::boolean
      OR has_function_privilege('authenticated',actual_fn.oid,'EXECUTE') IS DISTINCT FROM (obj->>'authenticated')::boolean
      OR EXISTS(SELECT 1 FROM aclexplode(coalesce(actual_fn.proacl,acldefault('f',actual_fn.proowner)))
        WHERE grantee=0 AND privilege_type='EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected function EXECUTE grants: %',obj->>'name';
    END IF;
    checked_functions:=checked_functions+1;
  END LOOP;

  FOR obj IN SELECT value FROM jsonb_array_elements(manifest->'triggers') LOOP
    IF (obj->>'phase')::integer>phase THEN CONTINUE; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_trigger
      WHERE tgname=obj->>'name' AND tgrelid=to_regclass('public.'||(obj->>'table'))
        AND NOT tgisinternal AND tgenabled IN ('O','A')) THEN
      RAISE EXCEPTION 'Missing or non-origin trigger: % on %',obj->>'name',obj->>'table';
    END IF;
    checked_triggers:=checked_triggers+1;
  END LOOP;
  IF phase>=4 AND NOT EXISTS(
    SELECT 1 FROM storage.buckets WHERE id='vento-business-closings' AND NOT public
      AND file_size_limit=5242880 AND allowed_mime_types @> ARRAY[
        'application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
  ) THEN RAISE EXCEPTION 'Private closing bucket is missing or misconfigured'; END IF;
  IF phase>=4 AND (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
    AND policyname IN ('vento_business_closings_read','vento_business_closings_insert')
    AND roles=ARRAY['authenticated']::name[] AND cmd IN ('SELECT','INSERT'))<>2 THEN
    RAISE EXCEPTION 'Missing restricted closing file policies';
  END IF;
  RAISE NOTICE 'PASS: Business phase % read-only preflight: % tables, % functions, % triggers',phase,checked_tables,checked_functions,checked_triggers;
END $business_preflight$;

-- Advisory text check only: a comment or inverted predicate could also match.
-- Confirmed-email behaviour is covered by the disposable phase-1 tests and real Auth QA.
SELECT position('email_confirmed_at' IN pg_get_functiondef('public.auth_email()'::regprocedure))>0
  AS email_guard_text_only_not_behavioral_proof;

-- Fingerprints cover these seven function definitions only, not the entire installation.
-- They exclude owner/ACL and do not replace behavioural or before/after data evidence.
SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       md5(pg_get_functiondef(p.oid)) AS definition_md5
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
  'instructor_can_attend','auth_email','accept_company_invitation',
  'complete_external_booking','company_place_order','get_public_order','cancel_public_order')
ORDER BY p.proname,identity_arguments;
SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') AS pg_cron_installed;
ROLLBACK;
