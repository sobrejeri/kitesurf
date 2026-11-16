-- Vento | Business fase 5: lojinha (configuração, cupons, pedidos com preço congelado) e afiliados
-- da empresa (solicitações, vínculos, percentuais em versões, seleção, campanhas, comissões).
--
-- Depende das fases 1 a 4. Só cria objetos novos e acrescenta permissões ao catálogo; não altera
-- nenhuma função nem tabela anterior.
--
-- Regras do projeto:
--  * O pedido é um PEDIDO, não um pagamento: nada é cobrado nem marcado como pago. O cliente da
--    função envia escolhas (itens, cupom, código do afiliado); preços, desconto, divisão por unidade
--    e comissão saem do banco e ficam congelados.
--  * Desconto do cupom: calculado uma vez sobre os itens das unidades cobertas, nunca maior que
--    eles, repartido por item com o resto no último até o valor de cada item.
--  * Itens de várias unidades: cada unidade enxerga só os seus itens (pedidos operacionais).
--  * Comissão de afiliado: percentual vigente no dia do pedido, congelado por item; mudança de
--    percentual é nova versão, sem efeito retroativo. Cancelamento zera; estorno reduz na
--    proporção. NÃO EXISTE estado "paga": o máximo é "a pagar" (due).
--  * Afiliado suspenso não recebe atribuição em pedidos novos; os antigos mantêm o direito.
--  * O afiliado lê as próprias vendas por função, sem nome nem telefone do cliente.
--  * Escrita só por função SECURITY DEFINER; tabelas sem INSERT/UPDATE/DELETE para o cliente; RLS em todas.
begin;

create type public.company_order_status as enum ('received', 'confirmed', 'ready', 'delivered', 'cancelled');
create type public.company_order_origin as enum ('vitrine', 'qr', 'instagram', 'afiliado', 'balcao');
create type public.company_order_item_kind as enum ('product', 'lesson', 'rental');

insert into public.company_permissions (id, sensitive) values
  ('shop.view', false), ('shop.edit', false), ('shop.manage', true), ('affil.view', false), ('affil.manage', true);
insert into public.company_role_permissions (role, permission) values
  ('manager', 'shop.view'), ('manager', 'shop.edit'), ('manager', 'shop.manage'), ('manager', 'affil.view'), ('manager', 'affil.manage'),
  ('finance', 'shop.view'), ('finance', 'affil.view'),
  ('attendant', 'shop.view'), ('attendant', 'shop.edit');

-- ---------------------------------------------------------------------------
-- Afiliados da empresa
-- ---------------------------------------------------------------------------
create table public.company_affiliate_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  partner_id uuid not null references public.partners (id),
  code text not null check (code ~ '^[A-Z0-9-]{3,32}$'),
  status public.company_link_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (company_id, partner_id),
  unique (company_id, code)
);
create table public.company_affiliate_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  partner_id uuid not null references public.partners (id),
  message text not null default '' check (char_length(message) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  reason text,
  decided_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index company_affiliate_requests_one_pending on public.company_affiliate_requests (company_id, partner_id) where status = 'pending';

-- ref_id nulo = percentual padrão; senão, um serviço ou produto da empresa. Versões nunca editadas.
create table public.company_affiliate_rates (
  id bigserial primary key,
  company_id uuid not null references public.companies (id),
  ref_id uuid,
  bps integer not null check (bps between 50 and 3000),
  from_date date not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create unique index company_affiliate_rates_one_per_day on public.company_affiliate_rates (company_id, coalesce(ref_id, '00000000-0000-0000-0000-000000000000'::uuid), from_date);
create trigger company_affiliate_rates_append_only before update or delete on public.company_affiliate_rates for each row execute function public.reject_change();

create table public.company_affiliate_selections (
  link_id uuid not null references public.company_affiliate_links (id),
  ref_id uuid not null,
  primary key (link_id, ref_id)
);
create table public.company_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name text not null check (char_length(name) between 3 and 60),
  description text not null default '' check (char_length(description) <= 140),
  until_date date not null,
  active boolean not null default true,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create table public.company_campaign_items (
  campaign_id uuid not null references public.company_campaigns (id),
  ref_id uuid not null,
  primary key (campaign_id, ref_id)
);

-- ---------------------------------------------------------------------------
-- Lojinha: configuração, cupons, pedidos
-- ---------------------------------------------------------------------------
create table public.company_store_settings (
  company_id uuid primary key references public.companies (id),
  name text not null check (char_length(name) between 3 and 60),
  slogan text not null default '' check (char_length(slogan) <= 90),
  whatsapp text not null check (whatsapp ~ '^[0-9]{10,13}$'),
  accent text not null default 'azul' check (accent in ('azul', 'preto', 'cinza')),
  updated_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now()
);

create table public.company_coupons (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  code text not null check (code ~ '^[A-Z0-9]{4,16}$'),
  kind text not null check (kind in ('percent', 'fixed')),
  -- percent: basis points (100 a 5000); fixed: centavos (100 a 100000)
  value integer not null,
  min_cents integer not null default 0 check (min_cents between 0 and 10000000),
  until_date date not null,
  max_uses integer not null check (max_uses between 1 and 10000),
  used integer not null default 0,
  active boolean not null default true,
  affiliate_link_id uuid references public.company_affiliate_links (id),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (company_id, code),
  constraint company_coupons_value check ((kind = 'percent' and value between 100 and 5000) or (kind = 'fixed' and value between 100 and 100000)),
  constraint company_coupons_used check (used between 0 and max_uses)
);
-- Sem linhas aqui = cupom vale em todas as unidades.
create table public.company_coupon_units (
  coupon_id uuid not null references public.company_coupons (id),
  unit_id uuid not null references public.company_units (id),
  primary key (coupon_id, unit_id)
);

create sequence public.company_order_seq start 1001;
create table public.company_orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('VK-' || nextval('public.company_order_seq')::text),
  company_id uuid not null references public.companies (id),
  customer_name text not null check (char_length(customer_name) between 3 and 80),
  customer_phone text not null check (customer_phone ~ '^[0-9]{10,13}$'),
  origin public.company_order_origin not null,
  status public.company_order_status not null default 'received',
  coupon_id uuid references public.company_coupons (id),
  affiliate_link_id uuid references public.company_affiliate_links (id),
  subtotal_cents integer not null check (subtotal_cents > 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  total_cents integer not null,
  -- Comissão cheia do afiliado, congelada na criação (0 sem afiliado).
  affiliate_commission_cents integer not null default 0 check (affiliate_commission_cents >= 0),
  -- Estorno feito pela escola fora do VentoKite; aqui só o registro.
  refunded_cents integer not null default 0,
  cancel_reason text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  cancelled_at timestamptz,
  constraint company_orders_total check (total_cents = subtotal_cents - discount_cents and total_cents >= 0),
  constraint company_orders_refund check (refunded_cents between 0 and total_cents),
  constraint company_orders_commission_needs_affiliate check (affiliate_link_id is not null or affiliate_commission_cents = 0),
  constraint company_orders_cancel_consistent check ((status = 'cancelled') = (cancelled_at is not null and cancel_reason is not null))
);
create index company_orders_company_idx on public.company_orders (company_id, created_at desc);
create index company_orders_affiliate_idx on public.company_orders (affiliate_link_id) where affiliate_link_id is not null;

create table public.company_order_items (
  id bigserial primary key,
  order_id uuid not null references public.company_orders (id),
  company_id uuid not null references public.companies (id),
  unit_id uuid not null references public.company_units (id),
  kind public.company_order_item_kind not null,
  product_id uuid references public.company_products (id),
  service_id uuid references public.company_services (id),
  instructor_id uuid references public.instructors (id),
  starts_at timestamptz,
  equipment_type public.company_equipment_type,
  hours smallint check (hours is null or hours between 1 and 8),
  qty smallint not null check (qty between 1 and 20),
  unit_price_cents integer not null check (unit_price_cents > 0),
  line_cents integer not null,
  discount_cents integer not null default 0,
  affiliate_bps integer not null default 0 check (affiliate_bps between 0 and 3000),
  constraint company_order_items_line check (line_cents = unit_price_cents * qty),
  constraint company_order_items_discount check (discount_cents between 0 and line_cents),
  constraint company_order_items_shape check (
    (kind = 'product' and product_id is not null and num_nonnulls(service_id, instructor_id, starts_at, equipment_type, hours) = 0)
    or (kind = 'lesson' and num_nonnulls(service_id, instructor_id, starts_at) = 3 and num_nonnulls(product_id, equipment_type, hours) = 0)
    or (kind = 'rental' and num_nonnulls(equipment_type, hours) = 2 and num_nonnulls(product_id, service_id, instructor_id, starts_at) = 0))
);
create index company_order_items_order_idx on public.company_order_items (order_id);
create index company_order_items_unit_idx on public.company_order_items (unit_id);
create trigger company_order_items_append_only before update or delete on public.company_order_items for each row execute function public.reject_change();

-- Do pedido só mudam situação, estorno e os campos de cancelamento e entrega.
create function public.company_orders_frozen() returns trigger
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
create trigger company_orders_snapshot_frozen before update on public.company_orders for each row execute function public.company_orders_frozen();
create trigger company_orders_no_delete before delete on public.company_orders for each row execute function public.reject_change();

-- ---------------------------------------------------------------------------
-- Funções internas
-- ---------------------------------------------------------------------------
create function public.company_my_partner_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.partners where owner_id = auth.uid();
$$;
create function public.company_affiliate_rate_bps(p_company uuid, p_ref uuid, p_on date) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select bps from public.company_affiliate_rates where company_id = p_company and ref_id = p_ref and from_date <= p_on order by from_date desc limit 1),
    (select bps from public.company_affiliate_rates where company_id = p_company and ref_id is null and from_date <= p_on order by from_date desc limit 1));
$$;
-- Um serviço ou produto ativo desta empresa?
create function public.company_is_offer(p_company uuid, p_ref uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.company_services where id = p_ref and company_id = p_company and active)
      or exists (select 1 from public.company_products where id = p_ref and company_id = p_company and active);
$$;
-- Comissão atual de um pedido: zero se cancelado; reduzida na proporção do estorno. Nunca "paga".
create function public.company_order_commission_cents(p_status public.company_order_status, p_full integer, p_total integer, p_refunded integer) returns integer
language sql immutable set search_path = '' as $$
  select case when p_status = 'cancelled' or p_total <= 0 then 0 else (p_full::bigint * (p_total - p_refunded) / p_total)::integer end;
$$;
create function public.company_order_commission_state(p_status public.company_order_status, p_total integer, p_refunded integer) returns text
language sql immutable set search_path = '' as $$
  select case when p_status = 'cancelled' then 'cancelled' when p_total > 0 and p_refunded = p_total then 'refunded' when p_status = 'delivered' then 'due' else 'expected' end;
$$;
create function public.company_order_can(p_order uuid, p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.company_order_items i where i.order_id = p_order and public.company_has_permission(i.unit_id, p_permission));
$$;

-- ---------------------------------------------------------------------------
-- Escritas: lojinha
-- ---------------------------------------------------------------------------
create function public.set_store_settings(p_company uuid, p_name text, p_slogan text, p_whatsapp text, p_accent text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if not public.company_any_permission(p_company, 'shop.manage') then raise exception 'Not allowed' using errcode = '42501'; end if;
  insert into public.company_store_settings (company_id, name, slogan, whatsapp, accent, updated_by)
    values (p_company, trim(p_name), coalesce(trim(p_slogan), ''), regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), p_accent, auth.uid())
    on conflict (company_id) do update set name = excluded.name, slogan = excluded.slogan, whatsapp = excluded.whatsapp, accent = excluded.accent, updated_by = excluded.updated_by, updated_at = now();
  perform public.company_audit(p_company, null, 'shop.settings', trim(p_name));
end;
$$;

-- p_value: percentual em basis points (1000 = 10%) ou valor fixo em centavos. p_units vazio = todas as unidades.
create function public.create_coupon(p_company uuid, p_code text, p_kind text, p_value integer, p_min_cents integer, p_valid_days integer, p_max_uses integer, p_units uuid[] default null, p_affiliate_link uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid; u uuid; today date := (now() at time zone 'America/Fortaleza')::date;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if not public.company_any_permission(p_company, 'shop.manage') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_valid_days is null or p_valid_days < 1 or p_valid_days > 365 then raise exception 'Validity from 1 to 365 days' using errcode = '22023'; end if;
  if p_affiliate_link is not null and not exists (select 1 from public.company_affiliate_links where id = p_affiliate_link and company_id = p_company and status = 'active') then
    raise exception 'Affiliate link not active in this company' using errcode = '22023';
  end if;
  insert into public.company_coupons (company_id, code, kind, value, min_cents, until_date, max_uses, affiliate_link_id, created_by)
    values (p_company, upper(trim(coalesce(p_code, ''))), p_kind, p_value, coalesce(p_min_cents, 0), today + p_valid_days, p_max_uses, p_affiliate_link, auth.uid()) returning id into cid;
  foreach u in array coalesce(p_units, '{}') loop
    if not exists (select 1 from public.company_units where id = u and company_id = p_company) then raise exception 'Unit not in this company' using errcode = '22023'; end if;
    insert into public.company_coupon_units (coupon_id, unit_id) values (cid, u);
  end loop;
  perform public.company_audit(p_company, null, 'coupon.created', upper(trim(p_code)), jsonb_build_object('kind', p_kind, 'value', p_value));
  return cid;
end;
$$;
create function public.set_coupon_active(p_coupon uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.company_coupons;
begin
  select * into c from public.company_coupons where id = p_coupon for update;
  if not found then raise exception 'Coupon not found' using errcode = 'P0002'; end if;
  if not public.company_any_permission(c.company_id, 'shop.manage') then raise exception 'Not allowed' using errcode = '42501'; end if;
  update public.company_coupons set active = p_active where id = p_coupon;
  perform public.company_audit(c.company_id, null, 'coupon.active', c.code, jsonb_build_object('active', p_active));
end;
$$;

-- Itens: [{"kind":"product","unit_id":..,"product_id":..,"qty":n},
--         {"kind":"lesson","unit_id":..,"service_id":..,"instructor_id":..,"starts_at":..,"qty":alunos},
--         {"kind":"rental","unit_id":..,"type":"prancha","hours":h,"qty":n}]
-- Nenhum valor é aceito do cliente. O pedido não reserva estoque nem agenda: confere a disponibilidade agora
-- e a escola atende pelos fluxos de reserva, caixa e aluguel.
create function public.create_order(p_company uuid, p_customer text, p_phone text, p_origin public.company_order_origin, p_items jsonb, p_coupon_code text default null, p_affiliate_code text default null) returns uuid
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

-- Avança a situação: recebido -> confirmado -> pronto -> entregue (só para frente).
create function public.set_order_status(p_order uuid, p_status public.company_order_status) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.company_orders;
begin
  select * into o from public.company_orders where id = p_order for update;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if not public.company_order_can(p_order, 'shop.edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_status = 'cancelled' then raise exception 'Use cancel_order' using errcode = '22023'; end if;
  if o.status in ('cancelled', 'delivered') or p_status <= o.status then raise exception 'The order only moves forward' using errcode = '55000'; end if;
  update public.company_orders set status = p_status, delivered_at = case when p_status = 'delivered' then now() else null end where id = p_order;
  perform public.company_audit(o.company_id, null, 'order.status', o.id::text, jsonb_build_object('status', p_status));
end;
$$;
create function public.cancel_order(p_order uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.company_orders;
begin
  select * into o from public.company_orders where id = p_order for update;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if not public.company_order_can(p_order, 'shop.edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if o.status in ('cancelled', 'delivered') then raise exception 'This order can no longer be cancelled' using errcode = '55000'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'A reason is required' using errcode = '22023'; end if;
  update public.company_orders set status = 'cancelled', cancelled_at = now(), cancel_reason = trim(p_reason) where id = p_order;
  perform public.company_audit(o.company_id, null, 'order.cancelled', o.id::text, jsonb_build_object('reason', trim(p_reason)));
end;
$$;
-- Registra um estorno feito pela escola fora do VentoKite (parcial ou total). Reduz a comissão do afiliado.
create function public.record_order_refund(p_order uuid, p_cents integer, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.company_orders;
begin
  select * into o from public.company_orders where id = p_order for update;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if not public.company_order_can(p_order, 'shop.manage') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if o.status <> 'delivered' then raise exception 'Only a delivered order is refunded' using errcode = '55000'; end if;
  if p_cents is null or p_cents < 1 or o.refunded_cents + p_cents > o.total_cents then raise exception 'Refund above the order total' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'A reason is required' using errcode = '22023'; end if;
  update public.company_orders set refunded_cents = refunded_cents + p_cents where id = p_order;
  perform public.company_audit(o.company_id, null, 'order.refund', o.id::text, jsonb_build_object('cents', p_cents, 'reason', trim(p_reason)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Escritas: afiliados
-- ---------------------------------------------------------------------------
create function public.request_company_affiliation(p_company uuid, p_message text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare pid uuid; rid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  select id into pid from public.partners where owner_id = auth.uid() and status = 'approved';
  if pid is null then raise exception 'Only an approved affiliate requests' using errcode = '42501'; end if;
  if not exists (select 1 from public.companies where id = p_company and status = 'active') then raise exception 'Company not available' using errcode = '22023'; end if;
  if exists (select 1 from public.company_affiliate_links where company_id = p_company and partner_id = pid and status = 'active') then raise exception 'Already linked' using errcode = '23505'; end if;
  insert into public.company_affiliate_requests (company_id, partner_id, message) values (p_company, pid, coalesce(trim(p_message), '')) returning id into rid;
  perform public.company_audit(p_company, null, 'affiliate.requested', pid::text);
  return rid;
end;
$$;
create function public.decide_affiliate_request(p_request uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.company_affiliate_requests; v_code text;
begin
  select * into r from public.company_affiliate_requests where id = p_request for update;
  if not found then raise exception 'Request not found' using errcode = 'P0002'; end if;
  if not public.company_any_permission(r.company_id, 'affil.manage') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if r.status <> 'pending' then raise exception 'Already decided' using errcode = '55000'; end if;
  if p_approve then
    select code into v_code from public.partners where id = r.partner_id and status = 'approved';
    if v_code is null then raise exception 'Affiliate is not approved on the platform' using errcode = '55000'; end if;
    insert into public.company_affiliate_links (company_id, partner_id, code) values (r.company_id, r.partner_id, v_code)
      on conflict (company_id, partner_id) do update set status = 'active';
  elsif char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Declining needs a reason' using errcode = '22023';
  end if;
  update public.company_affiliate_requests set status = case when p_approve then 'approved' else 'declined' end, reason = nullif(trim(coalesce(p_reason, '')), ''), decided_by = auth.uid(), decided_at = now() where id = p_request;
  perform public.company_audit(r.company_id, null, case when p_approve then 'affiliate.approved' else 'affiliate.declined' end, r.partner_id::text);
end;
$$;
-- Suspender aqui não altera o afiliado na plataforma nem as vendas já atribuídas.
create function public.set_affiliate_link_status(p_link uuid, p_status public.company_link_status, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.company_affiliate_links;
begin
  select * into l from public.company_affiliate_links where id = p_link for update;
  if not found then raise exception 'Link not found' using errcode = 'P0002'; end if;
  if not public.company_any_permission(l.company_id, 'affil.manage') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_status not in ('active', 'suspended', 'ended') then raise exception 'Invalid status' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'A reason is required' using errcode = '22023'; end if;
  update public.company_affiliate_links set status = p_status where id = p_link;
  perform public.company_audit(l.company_id, null, 'affiliate.link', p_link::text, jsonb_build_object('status', p_status, 'reason', trim(p_reason)));
end;
$$;
-- Nova versão a partir de hoje. p_ref nulo = padrão.
create function public.set_affiliate_rate(p_company uuid, p_ref uuid, p_bps integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if not public.company_any_permission(p_company, 'affil.manage') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_ref is not null and not public.company_is_offer(p_company, p_ref) then raise exception 'Not a service or product of this company' using errcode = '22023'; end if;
  insert into public.company_affiliate_rates (company_id, ref_id, bps, from_date, created_by) values (p_company, p_ref, p_bps, (now() at time zone 'America/Fortaleza')::date, auth.uid());
  perform public.company_audit(p_company, null, 'affiliate.rate', coalesce(p_ref::text, 'default'), jsonb_build_object('bps', p_bps));
end;
$$;
create function public.set_my_affiliate_selection(p_link uuid, p_refs uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.company_affiliate_links; r uuid;
begin
  select * into l from public.company_affiliate_links where id = p_link;
  if l.id is null or l.partner_id is distinct from public.company_my_partner_id() or l.status <> 'active' then raise exception 'Not allowed' using errcode = '42501'; end if;
  if coalesce(cardinality(p_refs), 0) > 50 then raise exception 'Too many items' using errcode = '22023'; end if;
  foreach r in array coalesce(p_refs, '{}') loop
    if not public.company_is_offer(l.company_id, r) then raise exception 'Not a service or product of this company' using errcode = '22023'; end if;
  end loop;
  delete from public.company_affiliate_selections where link_id = p_link;
  insert into public.company_affiliate_selections (link_id, ref_id) select p_link, x from unnest(coalesce(p_refs, '{}')) x group by x;
end;
$$;
create function public.create_campaign(p_company uuid, p_name text, p_description text, p_valid_days integer, p_refs uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid; r uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if not public.company_any_permission(p_company, 'affil.manage') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_valid_days is null or p_valid_days < 1 or p_valid_days > 365 then raise exception 'Validity from 1 to 365 days' using errcode = '22023'; end if;
  if coalesce(cardinality(p_refs), 0) < 1 then raise exception 'At least one item' using errcode = '22023'; end if;
  insert into public.company_campaigns (company_id, name, description, until_date, created_by)
    values (p_company, trim(p_name), coalesce(trim(p_description), ''), (now() at time zone 'America/Fortaleza')::date + p_valid_days, auth.uid()) returning id into cid;
  foreach r in array p_refs loop
    if not public.company_is_offer(p_company, r) then raise exception 'Not a service or product of this company' using errcode = '22023'; end if;
    insert into public.company_campaign_items (campaign_id, ref_id) values (cid, r) on conflict do nothing;
  end loop;
  perform public.company_audit(p_company, null, 'campaign.created', trim(p_name));
  return cid;
end;
$$;

-- As vendas do afiliado logado, sem nenhum dado do cliente. O estado nunca é "paga".
create function public.my_affiliate_sales()
returns table (company_id uuid, order_number text, created_at timestamptz, order_status public.company_order_status, total_cents integer, refunded_cents integer, commission_cents integer, commission_state text)
language sql stable security definer set search_path = '' as $$
  select o.company_id, o.number, o.created_at, o.status, o.total_cents, o.refunded_cents,
         public.company_order_commission_cents(o.status, o.affiliate_commission_cents, o.total_cents, o.refunded_cents),
         public.company_order_commission_state(o.status, o.total_cents, o.refunded_cents)
  from public.company_orders o join public.company_affiliate_links l on l.id = o.affiliate_link_id
  where auth.uid() is not null and l.partner_id = public.company_my_partner_id()
  order by o.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- RLS e concessões
-- ---------------------------------------------------------------------------
alter table public.company_affiliate_links enable row level security;
alter table public.company_affiliate_requests enable row level security;
alter table public.company_affiliate_rates enable row level security;
alter table public.company_affiliate_selections enable row level security;
alter table public.company_campaigns enable row level security;
alter table public.company_campaign_items enable row level security;
alter table public.company_store_settings enable row level security;
alter table public.company_coupons enable row level security;
alter table public.company_coupon_units enable row level security;
alter table public.company_orders enable row level security;
alter table public.company_order_items enable row level security;

create policy company_affiliate_links_select on public.company_affiliate_links for select to authenticated
  using (partner_id = public.company_my_partner_id() or public.company_any_permission(company_id, 'affil.view') or public.is_admin());
create policy company_affiliate_requests_select on public.company_affiliate_requests for select to authenticated
  using (partner_id = public.company_my_partner_id() or public.company_any_permission(company_id, 'affil.view') or public.is_admin());
create policy company_affiliate_rates_select on public.company_affiliate_rates for select to authenticated
  using (public.company_any_permission(company_id, 'affil.view') or public.is_admin()
    or exists (select 1 from public.company_affiliate_links l where l.company_id = company_affiliate_rates.company_id and l.partner_id = public.company_my_partner_id() and l.status = 'active'));
create policy company_affiliate_selections_select on public.company_affiliate_selections for select to authenticated
  using (exists (select 1 from public.company_affiliate_links l where l.id = link_id));
create policy company_campaigns_select on public.company_campaigns for select to authenticated
  using (public.company_any_permission(company_id, 'affil.view') or public.is_admin()
    or exists (select 1 from public.company_affiliate_links l where l.company_id = company_campaigns.company_id and l.partner_id = public.company_my_partner_id() and l.status = 'active'));
create policy company_campaign_items_select on public.company_campaign_items for select to authenticated
  using (exists (select 1 from public.company_campaigns c where c.id = campaign_id));
create policy company_store_settings_select on public.company_store_settings for select to authenticated
  using (public.company_any_permission(company_id, 'shop.view') or public.is_admin());
create policy company_coupons_select on public.company_coupons for select to authenticated
  using (public.company_any_permission(company_id, 'shop.view') or public.is_admin());
create policy company_coupon_units_select on public.company_coupon_units for select to authenticated
  using (exists (select 1 from public.company_coupons c where c.id = coupon_id));
-- O cabeçalho do pedido (com nome e telefone) só para quem atende alguma unidade dele; cada unidade vê só os seus itens.
create policy company_orders_select on public.company_orders for select to authenticated
  using (public.company_order_can(id, 'shop.view') or public.is_admin());
create policy company_order_items_select on public.company_order_items for select to authenticated
  using (public.company_has_permission(unit_id, 'shop.view') or public.is_admin());

revoke all on public.company_affiliate_links, public.company_affiliate_requests, public.company_affiliate_rates, public.company_affiliate_selections, public.company_campaigns,
  public.company_campaign_items, public.company_store_settings, public.company_coupons, public.company_coupon_units, public.company_orders, public.company_order_items from public, anon, authenticated;
grant select on public.company_affiliate_links, public.company_affiliate_requests, public.company_affiliate_rates, public.company_affiliate_selections, public.company_campaigns,
  public.company_campaign_items, public.company_store_settings, public.company_coupons, public.company_coupon_units, public.company_orders, public.company_order_items to authenticated;
revoke all on sequence public.company_affiliate_rates_id_seq, public.company_order_items_id_seq, public.company_order_seq from public, anon, authenticated;

revoke all on function public.company_orders_frozen(), public.company_my_partner_id(), public.company_affiliate_rate_bps(uuid, uuid, date), public.company_is_offer(uuid, uuid),
  public.company_order_commission_cents(public.company_order_status, integer, integer, integer), public.company_order_commission_state(public.company_order_status, integer, integer),
  public.company_order_can(uuid, text), public.set_store_settings(uuid, text, text, text, text),
  public.create_coupon(uuid, text, text, integer, integer, integer, integer, uuid[], uuid), public.set_coupon_active(uuid, boolean),
  public.create_order(uuid, text, text, public.company_order_origin, jsonb, text, text), public.set_order_status(uuid, public.company_order_status),
  public.cancel_order(uuid, text), public.record_order_refund(uuid, integer, text), public.request_company_affiliation(uuid, text),
  public.decide_affiliate_request(uuid, boolean, text), public.set_affiliate_link_status(uuid, public.company_link_status, text),
  public.set_affiliate_rate(uuid, uuid, integer), public.set_my_affiliate_selection(uuid, uuid[]), public.create_campaign(uuid, text, text, integer, uuid[]),
  public.my_affiliate_sales() from public, anon, authenticated;
grant execute on function public.set_store_settings(uuid, text, text, text, text),
  public.create_coupon(uuid, text, text, integer, integer, integer, integer, uuid[], uuid), public.set_coupon_active(uuid, boolean),
  public.create_order(uuid, text, text, public.company_order_origin, jsonb, text, text), public.set_order_status(uuid, public.company_order_status),
  public.cancel_order(uuid, text), public.record_order_refund(uuid, integer, text), public.request_company_affiliation(uuid, text),
  public.decide_affiliate_request(uuid, boolean, text), public.set_affiliate_link_status(uuid, public.company_link_status, text),
  public.set_affiliate_rate(uuid, uuid, integer), public.set_my_affiliate_selection(uuid, uuid[]), public.create_campaign(uuid, text, text, integer, uuid[]),
  public.my_affiliate_sales() to authenticated;
-- Usadas pelas políticas (rodam como o usuário logado) e pelas telas para mostrar a comissão.
grant execute on function public.company_my_partner_id(), public.company_order_can(uuid, text),
  public.company_order_commission_cents(public.company_order_status, integer, integer, integer),
  public.company_order_commission_state(public.company_order_status, integer, integer) to authenticated;
-- Internas (sem EXECUTE para o cliente): company_orders_frozen, company_affiliate_rate_bps, company_is_offer.

notify pgrst, 'reload schema';
commit;
