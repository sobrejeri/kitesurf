-- Reversão da migration 20261115160000_business_shop_affiliates.sql.
-- SÓ use se ainda NÃO houver pedidos, cupons, vínculos ou comissões de afiliados reais (apaga tudo isso).
-- Remove também as 5 permissões novas (shop.* e affil.*). Não toca nas fases 1 a 4.
begin;
drop function if exists public.my_affiliate_sales(), public.create_campaign(uuid, text, text, integer, uuid[]), public.set_my_affiliate_selection(uuid, uuid[]),
  public.set_affiliate_rate(uuid, uuid, integer), public.set_affiliate_link_status(uuid, public.company_link_status, text), public.decide_affiliate_request(uuid, boolean, text),
  public.request_company_affiliation(uuid, text), public.record_order_refund(uuid, integer, text), public.cancel_order(uuid, text),
  public.set_order_status(uuid, public.company_order_status), public.create_order(uuid, text, text, public.company_order_origin, jsonb, text, text),
  public.set_coupon_active(uuid, boolean), public.create_coupon(uuid, text, text, integer, integer, integer, integer, uuid[], uuid),
  public.set_store_settings(uuid, text, text, text, text), public.company_order_can(uuid, text),
  public.company_order_commission_state(public.company_order_status, integer, integer), public.company_order_commission_cents(public.company_order_status, integer, integer, integer),
  public.company_is_offer(uuid, uuid), public.company_affiliate_rate_bps(uuid, uuid, date), public.company_my_partner_id() cascade;
drop table if exists public.company_order_items, public.company_orders, public.company_coupon_units, public.company_coupons, public.company_store_settings,
  public.company_campaign_items, public.company_campaigns, public.company_affiliate_selections, public.company_affiliate_rates,
  public.company_affiliate_requests, public.company_affiliate_links cascade;
drop function if exists public.company_orders_frozen() cascade;
drop sequence if exists public.company_order_seq;
delete from public.company_member_overrides where permission in ('shop.view', 'shop.edit', 'shop.manage', 'affil.view', 'affil.manage');
delete from public.company_role_permissions where permission in ('shop.view', 'shop.edit', 'shop.manage', 'affil.view', 'affil.manage');
delete from public.company_permissions where id in ('shop.view', 'shop.edit', 'shop.manage', 'affil.view', 'affil.manage');
drop type if exists public.company_order_item_kind, public.company_order_origin, public.company_order_status;
notify pgrst, 'reload schema';
commit;
