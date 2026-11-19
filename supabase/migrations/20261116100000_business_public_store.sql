-- Vento | Business fase 7: vitrine pública das escolas e pedidos do aluno.
--
-- Depende das fases 1 a 6. Permite que um VISITANTE (sem conta) veja o catálogo de uma escola que
-- PUBLICOU a loja e envie um pedido, e que o aluno logado acompanhe os seus pedidos. Só cria
-- objetos novos e acrescenta colunas às tabelas da fase 5 e 1 (ainda não aplicadas em produção).
--
-- Regras do projeto, e controles específicos de exposição pública:
--  * A loja só é visível se a escola a PUBLICAR de propósito (slug + published). Padrão: fechada.
--  * O catálogo público é uma FUNÇÃO que devolve só campos permitidos (nunca custo, comissão, saldo
--    de estoque exato, e-mail ou telefone da equipe). Nenhuma tabela é aberta ao anon.
--  * O pedido do visitante usa o MESMO núcleo de cálculo da equipe (company_place_order, extraído da
--    create_order sem copiar a lógica): preços, desconto e comissão do banco, congelados. O cliente
--    só envia escolhas. Pedido é um PEDIDO: nada é cobrado, nada é reservado.
--  * Limites contra abuso, no banco: por telefone (3 por hora, 10 por dia, serializado por trava),
--    por empresa (60 por hora e 300 pedidos públicos em aberto) e no máximo 10 itens. Cupom só para
--    quem está logado (anônimo poderia esgotar o limite de usos).
--  * Acompanhamento sem conta: um token aleatório de 128 bits devolvido UMA vez; só o hash fica no banco.
--    Número do pedido sem o token não revela nada.
--  * O cliente (visitante ou aluno) nunca lê as tabelas: só funções, sem comissão, custo ou telefone alheio.
--  * Escrita só por função SECURITY DEFINER; RLS em todas as tabelas.
begin;

-- ---------------------------------------------------------------------------
-- Colunas novas
-- ---------------------------------------------------------------------------
alter table public.company_store_settings
  add column public_slug text,
  add column published boolean not null default false,
  add constraint company_store_slug_format check (public_slug is null or (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(public_slug) between 3 and 40)),
  add constraint company_store_published_needs_slug check (not published or public_slug is not null);
create unique index company_store_settings_slug_key on public.company_store_settings (public_slug) where public_slug is not null;

-- Pedido público: sem funcionário criador. customer_id liga ao aluno logado; o hash do token acompanha o visitante.
alter table public.company_orders alter column created_by drop not null;
alter table public.company_orders
  add column customer_id uuid references public.profiles (id),
  add column public_token_hash text check (public_token_hash is null or public_token_hash ~ '^[0-9a-f]{64}$');
create index company_orders_customer_idx on public.company_orders (customer_id) where customer_id is not null;
create index company_orders_public_idx on public.company_orders (company_id, customer_phone, created_at desc) where created_by is null;

-- Ação anônima também é auditada: o ator pode ser nulo (o detalhe marca "public").
alter table public.company_audit_logs alter column actor_id drop not null;

create or replace function public.company_orders_frozen() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.id, new.number, new.company_id, new.customer_name, new.customer_phone, new.origin, new.coupon_id, new.affiliate_link_id,
      new.subtotal_cents, new.discount_cents, new.total_cents, new.affiliate_commission_cents, new.created_by, new.created_at, new.customer_id, new.public_token_hash)
     is distinct from
     (old.id, old.number, old.company_id, old.customer_name, old.customer_phone, old.origin, old.coupon_id, old.affiliate_link_id,
      old.subtotal_cents, old.discount_cents, old.total_cents, old.affiliate_commission_cents, old.created_by, old.created_at, old.customer_id, old.public_token_hash) then
    raise exception 'An order snapshot is frozen' using errcode = 'insufficient_privilege';
  end if;
  if old.status = 'cancelled' then raise exception 'A cancelled order cannot change' using errcode = 'insufficient_privilege'; end if;
  if new.refunded_cents < old.refunded_cents then raise exception 'A refund record cannot be reduced' using errcode = 'insufficient_privilege'; end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Núcleo do pedido (extraído da create_order das fases 5/#293, sem alterar a lógica)
-- ---------------------------------------------------------------------------
create function public.company_place_order(p_company uuid, p_customer text, p_phone text, p_origin public.company_order_origin, p_items jsonb, p_coupon_code text, p_affiliate_code text, p_staff boolean, p_customer_id uuid, p_token_hash text) returns uuid
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
  if p_staff and auth.uid() is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if not exists (select 1 from public.companies where id = p_company and status = 'active') then raise exception 'Company not available' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then raise exception 'From 1 to 20 items' using errcode = '22023'; end if;

  for it in select value from jsonb_array_elements(p_items) loop
    v_unit := (it ->> 'unit_id')::uuid; v_kind := it ->> 'kind'; v_qty := coalesce((it ->> 'qty')::integer, 1);
    select * into u from public.company_units where id = v_unit and company_id = p_company and active;
    if u.id is null then raise exception 'Unit not available' using errcode = '22023'; end if;
    if p_staff then perform public.require_company_permission(v_unit, 'shop.edit'); end if;
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

  insert into public.company_orders (company_id, customer_name, customer_phone, origin, coupon_id, affiliate_link_id, subtotal_cents, discount_cents, total_cents, affiliate_commission_cents, created_by, customer_id, public_token_hash)
    values (p_company, trim(coalesce(p_customer, '')), phone, p_origin, c.id, l.id, v_subtotal, v_discount, v_subtotal - v_discount, v_comm, case when p_staff then auth.uid() else null end, p_customer_id, p_token_hash) returning id into oid;
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

  perform public.company_audit(p_company, null, 'order.created', oid::text, jsonb_build_object('total_cents', v_subtotal - v_discount, 'origin', p_origin, 'affiliate', l.id is not null, 'public', not p_staff));
  return oid;
end;
$$;

-- A função da equipe vira um invólucro: mesma assinatura, mesmas permissões, mesmos erros.
create or replace function public.create_order(p_company uuid, p_customer text, p_phone text, p_origin public.company_order_origin, p_items jsonb, p_coupon_code text default null, p_affiliate_code text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  return public.company_place_order(p_company, p_customer, p_phone, p_origin, p_items, p_coupon_code, p_affiliate_code, true, null, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Limites contra abuso (constantes num só lugar)
-- ---------------------------------------------------------------------------
create function public.company_public_limits() returns table (per_phone_hour integer, per_phone_day integer, per_company_hour integer, open_cap integer, max_items integer)
language sql immutable set search_path = '' as $$ select 3, 10, 60, 300, 10; $$;

-- Mesma regra de company_check_slot, SEM trava de linha e sem erro: serve às leituras públicas (nunca bloqueia reservas).
create function public.company_slot_ok(p_unit uuid, p_service uuid, p_instructor uuid, p_start timestamptz) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare u public.company_units; s public.company_services; us public.company_unit_services; ls timestamp; le timestamp;
begin
  select * into u from public.company_units where id = p_unit;
  select * into s from public.company_services where id = p_service;
  if u.id is null or s.id is null or s.company_id <> u.company_id or not u.active or not s.active then return false; end if;
  select * into us from public.company_unit_services where service_id = p_service and unit_id = p_unit and active;
  if us.service_id is null then return false; end if;
  if not exists (select 1 from public.company_instructor_links l2
      join public.company_unit_service_instructors usi on usi.link_id = l2.id and usi.service_id = p_service and usi.unit_id = p_unit
      where l2.company_id = u.company_id and l2.instructor_id = p_instructor and l2.status = 'active'
        and exists (select 1 from public.company_instructor_units iu where iu.link_id = l2.id and iu.unit_id = p_unit)
        and exists (select 1 from public.instructors i where i.id = p_instructor and i.status = 'approved')) then return false; end if;
  if p_start <= now() then return false; end if;
  ls := p_start at time zone 'America/Fortaleza'; le := (p_start + make_interval(mins => s.minutes)) at time zone 'America/Fortaleza';
  if not (extract(dow from ls)::smallint = any (us.weekdays)) or ls::date <> le::date or ls::time < u.opens or le::time > u.closes then return false; end if;
  return public.company_instructor_is_free(p_instructor, p_start, s.minutes, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Publicar a loja (escola)
-- ---------------------------------------------------------------------------
create function public.set_store_public(p_company uuid, p_slug text, p_published boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare s text := lower(trim(coalesce(p_slug, '')));
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if not public.company_any_permission(p_company, 'shop.manage') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.company_store_settings where company_id = p_company) then raise exception 'Configure the store first' using errcode = '55000'; end if;
  if s !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(s) not between 3 and 40 or s in ('admin', 'api', 'aluno', 'instrutor', 'afiliado', 'escola', 'escolas', 'entrar', 'business', 'auth', 'www') then
    raise exception 'Invalid address for the store' using errcode = '22023';
  end if;
  if coalesce(p_published, false) and not exists (select 1 from public.company_units u where u.company_id = p_company and u.active) then
    raise exception 'Publish needs at least one active unit' using errcode = '55000';
  end if;
  update public.company_store_settings set public_slug = s, published = coalesce(p_published, false), updated_by = auth.uid(), updated_at = now() where company_id = p_company;
  perform public.company_audit(p_company, null, 'shop.public', s, jsonb_build_object('published', coalesce(p_published, false)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Leituras públicas (visitante ou logado)
-- ---------------------------------------------------------------------------
create function public.public_store_list() returns table (slug text, name text, slogan text, accent text, cities text[])
language sql stable security definer set search_path = '' as $$
  select s.public_slug, s.name, s.slogan, s.accent,
         coalesce((select array_agg(distinct u.city order by u.city) from public.company_units u where u.company_id = s.company_id and u.active), '{}')
  from public.company_store_settings s join public.companies c on c.id = s.company_id
  where s.published and c.status = 'active' order by s.name;
$$;

create function public.company_published_id(p_slug text) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.company_id from public.company_store_settings s join public.companies c on c.id = s.company_id
  where s.published and c.status = 'active' and s.public_slug = lower(coalesce(p_slug, ''));
$$;

-- O catálogo: só o que o visitante pode ver. Estoque vira disponível sim ou não; instrutor, só o primeiro nome.
create function public.public_store_catalog(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid := public.company_published_id(p_slug); today date := (now() at time zone 'America/Fortaleza')::date; result jsonb;
begin
  if cid is null then raise exception 'Store not available' using errcode = 'P0002'; end if;
  select jsonb_build_object(
    'store', (select jsonb_build_object('name', s.name, 'slogan', s.slogan, 'whatsapp', s.whatsapp, 'accent', s.accent, 'slug', s.public_slug) from public.company_store_settings s where s.company_id = cid),
    'units', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'city', u.city, 'address', u.address, 'opens', to_char(u.opens, 'HH24:MI'), 'closes', to_char(u.closes, 'HH24:MI')) order by u.name)
        from public.company_units u where u.company_id = cid and u.active), '[]'),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', sv.id, 'name', sv.name, 'minutes', sv.minutes, 'capacity', sv.capacity, 'description', sv.description,
        'units', (select coalesce(jsonb_agg(jsonb_build_object('unit_id', us.unit_id, 'price_cents', public.company_service_price_cents(sv.id, us.unit_id, today), 'place', us.place, 'weekdays', us.weekdays,
            'instructors', (select coalesce(jsonb_agg(jsonb_build_object('id', l.instructor_id, 'first_name', split_part(pr.full_name, ' ', 1)) order by pr.full_name), '[]')
                from public.company_unit_service_instructors usi join public.company_instructor_links l on l.id = usi.link_id and l.status = 'active'
                join public.instructors i on i.id = l.instructor_id and i.status = 'approved' join public.profiles pr on pr.id = i.id
                where usi.service_id = sv.id and usi.unit_id = us.unit_id)) order by us.unit_id), '[]')
            from public.company_unit_services us join public.company_units uu on uu.id = us.unit_id and uu.active
            where us.service_id = sv.id and us.active and public.company_service_price_cents(sv.id, us.unit_id, today) is not null)) order by sv.name)
        from public.company_services sv where sv.company_id = cid and sv.active), '[]'),
    'products', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'category', p.category, 'price_cents', p.price_cents,
        'units', (select coalesce(jsonb_agg(jsonb_build_object('unit_id', u.id, 'available', coalesce(b.qty, 0) > 0) order by u.name), '[]')
            from public.company_units u left join public.company_stock_balances b on b.unit_id = u.id and b.product_id = p.id where u.company_id = cid and u.active)) order by p.name)
        from public.company_products p where p.company_id = cid and p.active), '[]'),
    'rentals', coalesce((select jsonb_agg(jsonb_build_object('type', t.type, 'cents_per_hour', t.cents,
        'units', (select coalesce(jsonb_agg(jsonb_build_object('unit_id', u.id, 'available', (select count(*) from public.company_equipment e where e.unit_id = u.id and e.type = t.type and public.company_equipment_status(e.id) = 'available')::integer) order by u.name), '[]')
            from public.company_units u where u.company_id = cid and u.active)) order by t.type)
        from (select distinct on (r.type) r.type, r.cents_per_hour as cents from public.company_rental_rates r where r.company_id = cid and r.from_date <= today order by r.type, r.from_date desc) t
        where exists (select 1 from public.company_equipment e where e.company_id = cid and e.type = t.type and not e.retired)), '[]')
  ) into result;
  return result;
end;
$$;

-- Horários livres de um dia (30 em 30 min), só para o instrutor e serviço escolhidos. Estável: nunca trava nada.
create function public.public_free_slots(p_slug text, p_unit uuid, p_service uuid, p_instructor uuid, p_date date) returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid := public.company_published_id(p_slug); today date := (now() at time zone 'America/Fortaleza')::date; u public.company_units; t integer; out text[] := '{}'; st timestamptz;
begin
  if cid is null then raise exception 'Store not available' using errcode = 'P0002'; end if;
  if p_date is null or p_date <= today or p_date > today + 60 then return '{}'; end if;
  select * into u from public.company_units where id = p_unit and company_id = cid and active;
  if u.id is null then return '{}'; end if;
  for t in 0..47 loop
    st := ((p_date + make_interval(mins => t * 30)::interval)::timestamp) at time zone 'America/Fortaleza';
    if (st at time zone 'America/Fortaleza')::date = p_date and public.company_slot_ok(p_unit, p_service, p_instructor, st) then out := out || to_char(st at time zone 'America/Fortaleza', 'HH24:MI'); end if;
  end loop;
  return out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pedido do visitante ou do aluno logado
-- ---------------------------------------------------------------------------
create function public.create_public_order(p_slug text, p_customer text, p_phone text, p_items jsonb, p_affiliate_code text default null, p_coupon_code text default null)
returns table (order_number text, token text, total_cents integer)
language plpgsql security definer set search_path = '' as $$
declare cid uuid := public.company_published_id(p_slug); lim record; phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'); uid uuid := auth.uid(); r public.app_role;
  v_token text; oid uuid; o public.company_orders;
begin
  if cid is null then raise exception 'Store not available' using errcode = 'P0002'; end if;
  select * into lim from public.company_public_limits();
  if phone !~ '^[0-9]{10,13}$' then raise exception 'Invalid phone' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_customer, ''))) not between 3 and 80 then raise exception 'Invalid name' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > lim.max_items then raise exception 'From 1 to % items', lim.max_items using errcode = '22023'; end if;
  if uid is not null then
    select role into r from public.profiles where id = uid;
    if r = 'admin' then raise exception 'Not allowed for this account' using errcode = '42501'; end if;
  end if;
  if trim(coalesce(p_coupon_code, '')) <> '' and public.auth_email() is null then raise exception 'Sign in with a confirmed e-mail to use a coupon' using errcode = '28000'; end if;
  -- Serializa por telefone: dez pedidos simultâneos do mesmo número contam um a um.
  perform pg_advisory_xact_lock(hashtextextended(cid::text || ':' || phone, 0));
  if (select count(*) from public.company_orders where company_id = cid and created_by is null and customer_phone = phone and created_at > now() - interval '1 hour') >= lim.per_phone_hour
     or (select count(*) from public.company_orders where company_id = cid and created_by is null and customer_phone = phone and created_at > now() - interval '1 day') >= lim.per_phone_day
     or (select count(*) from public.company_orders where company_id = cid and created_by is null and created_at > now() - interval '1 hour') >= lim.per_company_hour
     or (select count(*) from public.company_orders where company_id = cid and created_by is null and status = 'received') >= lim.open_cap then
    raise exception 'Too many requests. Try again later.' using errcode = '54000';
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  oid := public.company_place_order(cid, p_customer, phone, 'vitrine', p_items, nullif(trim(coalesce(p_coupon_code, '')), ''), nullif(trim(coalesce(p_affiliate_code, '')), ''), false, uid,
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'));
  select * into o from public.company_orders where id = oid;
  return query select o.number, v_token, o.total_cents;
end;
$$;

-- Estado de um pedido: com o token (visitante) ou logado como o aluno que o fez. Sem comissão, custo ou telefone.
create function public.get_public_order(p_number text, p_token text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare o public.company_orders; ok boolean := false;
begin
  select * into o from public.company_orders where number = upper(trim(coalesce(p_number, '')));
  if o.id is not null then
    -- coalesce: customer_id é nulo nos pedidos de visitante, e NULL numa condição não pode virar permissão nem recusa silenciosa.
    ok := coalesce(o.public_token_hash is not null and p_token is not null and o.public_token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex'), false)
       or coalesce(auth.uid() is not null and o.customer_id = auth.uid(), false);
  end if;
  if ok is distinct from true then raise exception 'Order not found' using errcode = 'P0002'; end if;
  return jsonb_build_object('number', o.number, 'status', o.status, 'created_at', o.created_at, 'subtotal_cents', o.subtotal_cents, 'discount_cents', o.discount_cents, 'total_cents', o.total_cents,
    'cancellable', o.status = 'received',
    'store', (select jsonb_build_object('name', s.name, 'whatsapp', s.whatsapp) from public.company_store_settings s where s.company_id = o.company_id),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('kind', i.kind, 'qty', i.qty, 'starts_at', i.starts_at, 'hours', i.hours, 'line_cents', i.line_cents, 'discount_cents', i.discount_cents,
        'unit', un.name, 'name', case i.kind when 'product' then pr.name when 'lesson' then sv.name else 'Aluguel de ' || i.equipment_type::text end) order by i.id), '[]')
      from public.company_order_items i join public.company_units un on un.id = i.unit_id left join public.company_products pr on pr.id = i.product_id left join public.company_services sv on sv.id = i.service_id
      where i.order_id = o.id));
end;
$$;

create function public.cancel_public_order(p_number text, p_token text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.company_orders; ok boolean := false;
begin
  select * into o from public.company_orders where number = upper(trim(coalesce(p_number, ''))) for update;
  if o.id is not null then
    -- coalesce: customer_id é nulo nos pedidos de visitante, e NULL numa condição não pode virar permissão nem recusa silenciosa.
    ok := coalesce(o.public_token_hash is not null and p_token is not null and o.public_token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex'), false)
       or coalesce(auth.uid() is not null and o.customer_id = auth.uid(), false);
  end if;
  if ok is distinct from true then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if o.status <> 'received' then raise exception 'The school already started this order. Contact the school.' using errcode = '55000'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why' using errcode = '22023'; end if;
  update public.company_orders set status = 'cancelled', cancelled_at = now(), cancel_reason = left('Cliente: ' || trim(p_reason), 200) where id = o.id;
  perform public.company_audit(o.company_id, null, 'order.cancelled_by_customer', o.id::text, jsonb_build_object('public', true));
end;
$$;

create function public.my_orders() returns table (number text, store_name text, status public.company_order_status, total_cents integer, created_at timestamptz, cancellable boolean)
language sql stable security definer set search_path = '' as $$
  select o.number, coalesce(s.name, c.trade_name), o.status, o.total_cents, o.created_at, o.status = 'received'
  from public.company_orders o join public.companies c on c.id = o.company_id left join public.company_store_settings s on s.company_id = o.company_id
  where auth.uid() is not null and o.customer_id = auth.uid() order by o.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Concessões
-- ---------------------------------------------------------------------------
revoke all on function public.company_place_order(uuid, text, text, public.company_order_origin, jsonb, text, text, boolean, uuid, text), public.company_public_limits(),
  public.company_slot_ok(uuid, uuid, uuid, timestamptz), public.company_published_id(text), public.set_store_public(uuid, text, boolean),
  public.public_store_list(), public.public_store_catalog(text), public.public_free_slots(text, uuid, uuid, uuid, date),
  public.create_public_order(text, text, text, jsonb, text, text), public.get_public_order(text, text), public.cancel_public_order(text, text, text), public.my_orders() from public, anon, authenticated;
grant execute on function public.public_store_list(), public.public_store_catalog(text), public.public_free_slots(text, uuid, uuid, uuid, date),
  public.create_public_order(text, text, text, jsonb, text, text), public.get_public_order(text, text), public.cancel_public_order(text, text, text) to anon, authenticated;
grant execute on function public.set_store_public(uuid, text, boolean), public.my_orders() to authenticated;
-- Internas (sem EXECUTE para o cliente): company_place_order, company_public_limits, company_slot_ok, company_published_id.

notify pgrst, 'reload schema';
commit;
