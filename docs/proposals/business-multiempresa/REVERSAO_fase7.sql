-- Reversão da migration 20261116100000_business_public_store.sql.
-- SÓ use se ainda NÃO houver pedidos públicos nem auditoria anônima (a guarda abaixo recusa a reversão se houver).
-- Restaura a create_order e o gatilho company_orders_frozen exatamente como eram (fase 5 + #293), remove as funções
-- públicas e as colunas novas. Não toca em nenhum objeto anterior à fase 7.
begin;
do $$ begin
  if exists (select 1 from public.company_orders where created_by is null) or exists (select 1 from public.company_audit_logs where actor_id is null) then
    raise exception 'There are public orders or anonymous audit rows: do not revert (export them first)';
  end if;
end $$;
drop function if exists public.my_orders(), public.cancel_public_order(text, text, text), public.get_public_order(text, text), public.create_public_order(text, text, text, jsonb, text, text),
  public.public_free_slots(text, uuid, uuid, uuid, date), public.public_store_catalog(text), public.company_published_id(text), public.public_store_list(),
  public.set_store_public(uuid, text, boolean), public.company_slot_ok(uuid, uuid, uuid, timestamptz), public.company_public_limits() cascade;
create or replace function public.create_order(p_company uuid, p_customer text, p_phone text, p_origin public.company_order_origin, p_items jsonb, p_coupon_code text default null, p_affiliate_code text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'America/Fortaleza')::date;
  it jsonb; priced jsonb := '[]'::jsonb; final jsonb := '[]'::jsonb; entry jsonb;
  u public.company_units; p public.company_products; s public.company_services; c public.company_coupons; l public.company_affiliate_links;
  v_unit uuid; v_kind text; v_qty integer; v_price integer; v_line integer; v_hours integer; v_rate integer;
  v_subtotal integer := 0; v_discount integer := 0; v_base integer := 0; v_left integer; v_share integer; v_remaining_base integer;
  v_has_units boolean := false; v_eligible boolean; v_bps integer; v_comm integer := 0; v_code text := upper(trim(coalesce(p_coupon_code, '')));
  oid uuid; phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if not exists (select 1 from public.companies where id = p_company and status = 'active') then raise exception 'Company not available' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then raise exception 'From 1 to 20 items' using errcode = '22023'; end if;

  for it in select value from jsonb_array_elements(p_items) loop
    v_unit := (it ->> 'unit_id')::uuid; v_kind := it ->> 'kind'; v_qty := coalesce((it ->> 'qty')::integer, 1);
    select * into u from public.company_units where id = v_unit and company_id = p_company and active;
    if u.id is null then raise exception 'Unit not available' using errcode = '22023'; end if;
    perform public.require_company_permission(v_unit, 'shop.edit');
    if v_qty < 1 or v_qty > 20 then raise exception 'Quantity from 1 to 20' using errcode = '22023'; end if;
    if v_kind = 'product' then
      select * into p from public.company_products where id = (it ->> 'product_id')::uuid and company_id = p_company and active;
      if p.id is null then raise exception 'Product not available' using errcode = '22023'; end if;
      v_price := p.price_cents;
      entry := jsonb_build_object('unit_id', v_unit, 'kind', v_kind, 'product_id', p.id, 'ref', p.id);
    elsif v_kind = 'lesson' then
      select * into s from public.company_services where id = (it ->> 'service_id')::uuid and company_id = p_company and active;
      if s.id is null then raise exception 'Service not available' using errcode = '22023'; end if;
      if v_qty > s.capacity then raise exception 'Above the lesson capacity' using errcode = '22023'; end if;
      perform 1 from public.company_check_slot(v_unit, s.id, (it ->> 'instructor_id')::uuid, (it ->> 'starts_at')::timestamptz, null);
      v_price := public.company_service_price_cents(s.id, v_unit, today);
      if v_price is null then raise exception 'No price in force' using errcode = 'P0002'; end if;
      entry := jsonb_build_object('unit_id', v_unit, 'kind', v_kind, 'service_id', s.id, 'instructor_id', it ->> 'instructor_id', 'starts_at', (it ->> 'starts_at')::timestamptz, 'ref', s.id);
    elsif v_kind = 'rental' then
      v_hours := (it ->> 'hours')::integer;
      if v_hours is null or v_hours < 1 or v_hours > 8 then raise exception 'Rental of 1 to 8 hours' using errcode = '22023'; end if;
      select cents_per_hour into v_rate from public.company_rental_rates
        where company_id = p_company and type = (it ->> 'type')::public.company_equipment_type and from_date <= today order by from_date desc limit 1;
      if v_rate is null then raise exception 'No rental rate in force' using errcode = 'P0002'; end if;
      v_price := v_rate * v_hours;
      entry := jsonb_build_object('unit_id', v_unit, 'kind', v_kind, 'type', it ->> 'type', 'hours', v_hours);
    else
      raise exception 'Unknown item kind' using errcode = '22023';
    end if;
    v_line := v_price * v_qty; v_subtotal := v_subtotal + v_line;
    priced := priced || jsonb_build_array(entry || jsonb_build_object('qty', v_qty, 'unit_price', v_price, 'line', v_line));
  end loop;

  -- Cupom: trava a linha (o limite de usos vale mesmo com pedidos simultâneos).
  if v_code <> '' then
    select * into c from public.company_coupons where company_id = p_company and code = v_code for update;
    if not found then raise exception 'Coupon not found' using errcode = '22023'; end if;
    if not c.active then raise exception 'Coupon is paused' using errcode = '22023'; end if;
    if c.until_date < today then raise exception 'Coupon expired' using errcode = '22023'; end if;
    if c.used >= c.max_uses then raise exception 'Coupon reached its limit' using errcode = '22023'; end if;
    v_has_units := exists (select 1 from public.company_coupon_units where coupon_id = c.id);
    for entry in select value from jsonb_array_elements(priced) loop
      if not v_has_units or exists (select 1 from public.company_coupon_units where coupon_id = c.id and unit_id = (entry ->> 'unit_id')::uuid) then
        v_base := v_base + (entry ->> 'line')::integer;
      end if;
    end loop;
    if v_base = 0 then raise exception 'Coupon does not cover these units' using errcode = '22023'; end if;
    if v_base < c.min_cents then raise exception 'Below the coupon minimum' using errcode = '22023'; end if;
    v_discount := least(case when c.kind = 'percent' then (v_base::bigint * c.value / 10000)::integer else c.value end, v_base);
    update public.company_coupons set used = used + 1 where id = c.id;
  end if;

  -- Atribuição: código do afiliado, ou cupom do afiliado. Só vínculo ativo.
  if trim(coalesce(p_affiliate_code, '')) <> '' then
    select * into l from public.company_affiliate_links where company_id = p_company and code = upper(trim(p_affiliate_code)) and status = 'active';
  elsif c.affiliate_link_id is not null then
    select * into l from public.company_affiliate_links where id = c.affiliate_link_id and status = 'active';
  end if;

  -- O último item coberto recebe o resto. Se faltar margem nele, as linhas anteriores
  -- absorvem apenas o excedente, sem que nenhum desconto passe do valor do item.
  v_left := v_discount;
  v_remaining_base := v_base;
  for entry in select value from jsonb_array_elements(priced) with ordinality order by ordinality loop
    v_line := (entry ->> 'line')::integer; v_share := 0;
    v_eligible := v_discount > 0 and (not v_has_units or exists (select 1 from public.company_coupon_units where coupon_id = c.id and unit_id = (entry ->> 'unit_id')::uuid));
    if v_eligible then
      v_remaining_base := v_remaining_base - v_line;
      v_share := greatest((v_discount::bigint * v_line / v_base)::integer, v_left - v_remaining_base);
      v_left := v_left - v_share;
    end if;
    v_bps := case when l.id is null then 0 else coalesce(public.company_affiliate_rate_bps(p_company, (entry ->> 'ref')::uuid, today), 0) end;
    v_comm := v_comm + ((v_line - v_share)::bigint * v_bps / 10000)::integer;
    final := final || jsonb_build_array(entry || jsonb_build_object('discount', v_share, 'bps', v_bps));
  end loop;

  insert into public.company_orders (company_id, customer_name, customer_phone, origin, coupon_id, affiliate_link_id, subtotal_cents, discount_cents, total_cents, affiliate_commission_cents, created_by)
    values (p_company, trim(coalesce(p_customer, '')), phone, p_origin, c.id, l.id, v_subtotal, v_discount, v_subtotal - v_discount, v_comm, auth.uid()) returning id into oid;
  insert into public.company_order_items (order_id, company_id, unit_id, kind, product_id, service_id, instructor_id, starts_at, equipment_type, hours, qty, unit_price_cents, line_cents, discount_cents, affiliate_bps)
    select oid, p_company, (e ->> 'unit_id')::uuid, (e ->> 'kind')::public.company_order_item_kind, (e ->> 'product_id')::uuid, (e ->> 'service_id')::uuid, (e ->> 'instructor_id')::uuid,
           (e ->> 'starts_at')::timestamptz, (e ->> 'type')::public.company_equipment_type, (e ->> 'hours')::smallint, (e ->> 'qty')::smallint,
           (e ->> 'unit_price')::integer, (e ->> 'line')::integer, (e ->> 'discount')::integer, (e ->> 'bps')::integer
    from jsonb_array_elements(final) e;

  -- Disponibilidade somando o pedido inteiro.
  if exists (select 1 from public.company_order_items i where i.order_id = oid and i.kind = 'product' group by i.unit_id, i.product_id
      having sum(i.qty) > coalesce((select b.qty from public.company_stock_balances b where b.unit_id = i.unit_id and b.product_id = i.product_id), 0)) then
    raise exception 'Not enough stock in the unit' using errcode = '55000';
  end if;
  if exists (select 1 from public.company_order_items i where i.order_id = oid and i.kind = 'rental' group by i.unit_id, i.equipment_type
      having sum(i.qty) > (select count(*) from public.company_equipment e where e.unit_id = i.unit_id and e.type = i.equipment_type and public.company_equipment_status(e.id) = 'available')) then
    raise exception 'Not enough equipment available in the unit' using errcode = '55000';
  end if;
  if exists (select 1 from public.company_order_items i where i.order_id = oid and i.kind = 'lesson' group by i.instructor_id, i.starts_at having count(*) > 1) then
    raise exception 'The same lesson time appears twice' using errcode = '22023';
  end if;

  perform public.company_audit(p_company, null, 'order.created', oid::text, jsonb_build_object('total_cents', v_subtotal - v_discount, 'origin', p_origin, 'affiliate', l.id is not null));
  return oid;
end;
$$;
create or replace function public.company_orders_frozen() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.id, new.number, new.company_id, new.customer_name, new.customer_phone, new.origin, new.coupon_id, new.affiliate_link_id,
      new.subtotal_cents, new.discount_cents, new.total_cents, new.affiliate_commission_cents, new.created_by, new.created_at)
     is distinct from
     (old.id, old.number, old.company_id, old.customer_name, old.customer_phone, old.origin, old.coupon_id, old.affiliate_link_id,
      old.subtotal_cents, old.discount_cents, old.total_cents, old.affiliate_commission_cents, old.created_by, old.created_at) then
    raise exception 'An order snapshot is frozen' using errcode = 'insufficient_privilege';
  end if;
  if old.status = 'cancelled' then raise exception 'A cancelled order cannot change' using errcode = 'insufficient_privilege'; end if;
  if new.refunded_cents < old.refunded_cents then raise exception 'A refund record cannot be reduced' using errcode = 'insufficient_privilege'; end if;
  return new;
end;
$$;
drop function if exists public.company_place_order(uuid, text, text, public.company_order_origin, jsonb, text, text, boolean, uuid, text);
drop index if exists public.company_orders_public_idx, public.company_orders_customer_idx, public.company_store_settings_slug_key;
alter table public.company_orders drop column if exists public_token_hash, drop column if exists customer_id;
alter table public.company_orders alter column created_by set not null;
alter table public.company_audit_logs alter column actor_id set not null;
alter table public.company_store_settings drop constraint if exists company_store_published_needs_slug, drop constraint if exists company_store_slug_format,
  drop column if exists published, drop column if exists public_slug;
notify pgrst, 'reload schema';
commit;
