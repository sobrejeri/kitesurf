-- Reversão da migration 20261115140000_business_stock_rentals.sql.
-- SÓ use se ainda NÃO houver dados reais de estoque, equipamentos, aluguéis ou manutenção (apaga tudo isso).
-- Remove também as 3 permissões novas (stock.view, stock.edit, stock.adjust) do catálogo e dos cargos, e
-- qualquer exceção por pessoa que as use. Não toca nas fases 1 e 2 nem em nenhum objeto anterior.
begin;
drop function if exists public.retire_equipment(uuid, text), public.close_maintenance(uuid, integer, public.company_condition), public.open_maintenance(uuid, text),
  public.return_rental(uuid, public.company_condition, text), public.start_rental(uuid, text, integer), public.set_rental_rate(uuid, public.company_equipment_type, integer),
  public.create_equipment(uuid, text, public.company_equipment_type, text, public.company_condition), public.transfer_stock(uuid, uuid, uuid, integer),
  public.record_stock_movement(uuid, uuid, text, integer, text), public.create_product(uuid, text, text, text, integer, integer),
  public.company_condition_rank(public.company_condition), public.company_equipment_status(uuid) cascade;
drop table if exists public.company_maintenance, public.company_rentals, public.company_rental_rates, public.company_equipment,
  public.company_stock_movements, public.company_stock_balances, public.company_products cascade;
drop function if exists public.company_rentals_frozen() cascade;
drop function if exists public.company_stock_apply() cascade;
delete from public.company_member_overrides where permission in ('stock.view', 'stock.edit', 'stock.adjust');
delete from public.company_role_permissions where permission in ('stock.view', 'stock.edit', 'stock.adjust');
delete from public.company_permissions where id in ('stock.view', 'stock.edit', 'stock.adjust');
drop type if exists public.company_maintenance_status, public.company_condition, public.company_equipment_type, public.company_stock_type;
notify pgrst, 'reload schema';
commit;
