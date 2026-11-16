-- Vento | Business fase 3: estoque (razão), equipamentos individuais, aluguéis e manutenção.
--
-- Depende das fases 1 e 2 (empresas, unidades, permissões por unidade). Só cria objetos novos
-- e acrescenta permissões ao catálogo; não altera nenhuma função nem tabela anterior.
--
-- Regras do projeto:
--  * Estoque é um RAZÃO: a quantidade de um produto numa unidade é a soma das movimentações,
--    nunca digitada. O saldo fica numa tabela mantida por gatilho com CHECK (qty >= 0), então
--    nenhuma venda, ajuste ou transferência, nem duas ao mesmo tempo, deixa o estoque negativo.
--  * Transferência = duas movimentações com o mesmo transfer_id, na mesma transação: o total
--    entre unidades nunca muda.
--  * Equipamento tem identificação individual; a situação é DERIVADA (aposentado > em
--    manutenção > alugado > disponível), nunca gravada.
--  * Aluguel tem preço congelado (hora vigente × horas, calculado no banco); um aluguel ativo
--    por equipamento (índice único); devolução em estado "ruim" abre manutenção.
--  * Escrita só por função SECURITY DEFINER; tabelas sem INSERT/UPDATE/DELETE para o cliente;
--    RLS em todas; razão e tarifas append-only.
--  * Aluguel não registra pagamento: o recebimento é fora do VentoKite.
begin;

create type public.company_stock_type as enum ('in', 'sale', 'adjust', 'transfer_out', 'transfer_in');
create type public.company_equipment_type as enum ('prancha', 'pipa', 'trapezio', 'colete', 'capacete');
create type public.company_condition as enum ('novo', 'bom', 'regular', 'ruim');
create type public.company_maintenance_status as enum ('open', 'done');

-- Permissões novas no catálogo (a fase 1 criou a tabela e os cargos).
insert into public.company_permissions (id, sensitive) values ('stock.view', false), ('stock.edit', false), ('stock.adjust', true);
insert into public.company_role_permissions (role, permission) values
  ('manager', 'stock.view'), ('manager', 'stock.edit'), ('manager', 'stock.adjust'),
  ('finance', 'stock.view'),
  ('attendant', 'stock.view'), ('attendant', 'stock.edit');

-- ---------------------------------------------------------------------------
-- Produtos, razão e saldo
-- ---------------------------------------------------------------------------
create table public.company_products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  sku text not null check (sku ~ '^[A-Z0-9-]{3,12}$'),
  name text not null check (char_length(name) between 3 and 60),
  category text not null default '' check (char_length(category) <= 40),
  price_cents integer not null check (price_cents between 100 and 10000000),
  min_stock integer not null default 0 check (min_stock between 0 and 100000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, sku)
);

create table public.company_stock_balances (
  unit_id uuid not null references public.company_units (id),
  product_id uuid not null references public.company_products (id),
  qty integer not null check (qty >= 0),
  primary key (unit_id, product_id)
);

create table public.company_stock_movements (
  id bigserial primary key,
  company_id uuid not null references public.companies (id),
  unit_id uuid not null references public.company_units (id),
  product_id uuid not null references public.company_products (id),
  type public.company_stock_type not null,
  qty integer not null check (qty <> 0 and qty between -1000000 and 1000000),
  transfer_id uuid,
  note text not null check (char_length(note) between 3 and 160),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint company_stock_sign check (
    (type in ('in', 'transfer_in') and qty > 0) or (type in ('sale', 'transfer_out') and qty < 0) or type = 'adjust'),
  constraint company_stock_transfer_id check ((type in ('transfer_in', 'transfer_out')) = (transfer_id is not null))
);
create index company_stock_movements_idx on public.company_stock_movements (unit_id, product_id, created_at desc);
create index company_stock_transfer_idx on public.company_stock_movements (transfer_id) where transfer_id is not null;

-- O saldo acompanha o razão no mesmo comando: o UPDATE trava a linha, então duas movimentações
-- simultâneas se enfileiram e o CHECK (qty >= 0) recusa a que deixaria o estoque negativo.
create function public.company_stock_apply() returns trigger
language plpgsql security definer set search_path = '' as $$
declare done boolean := false;
begin
  begin
    -- Atualiza primeiro (o CHECK da linha proposta de um INSERT roda antes do ON CONFLICT, e uma venda
    -- é negativa). Se a linha ainda não existe, insere; se outra transação a criou entre os dois
    -- comandos, o ON CONFLICT DO NOTHING não insere e o laço volta a atualizar.
    while not done loop
      update public.company_stock_balances set qty = qty + new.qty where unit_id = new.unit_id and product_id = new.product_id;
      if found then done := true;
      else
        insert into public.company_stock_balances (unit_id, product_id, qty) values (new.unit_id, new.product_id, new.qty) on conflict (unit_id, product_id) do nothing;
        done := found;
      end if;
    end loop;
  exception when check_violation then
    raise exception 'Stock cannot go negative' using errcode = '23514';
  end;
  return new;
end;
$$;
create trigger company_stock_movements_apply after insert on public.company_stock_movements
  for each row execute function public.company_stock_apply();
create trigger company_stock_movements_append_only before update or delete on public.company_stock_movements
  for each row execute function public.reject_change();

-- ---------------------------------------------------------------------------
-- Equipamentos, tarifa de aluguel, aluguéis e manutenção
-- ---------------------------------------------------------------------------
create table public.company_equipment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  unit_id uuid not null references public.company_units (id),
  code text not null check (code ~ '^[A-Z]{2}-[0-9]{2,3}$'),
  type public.company_equipment_type not null,
  label text not null check (char_length(label) between 3 and 60),
  condition public.company_condition not null default 'bom',
  retired boolean not null default false,
  created_at timestamptz not null default now(),
  unique (company_id, code)
);
create index company_equipment_unit_idx on public.company_equipment (unit_id);

create table public.company_rental_rates (
  id bigserial primary key,
  company_id uuid not null references public.companies (id),
  type public.company_equipment_type not null,
  cents_per_hour integer not null check (cents_per_hour between 100 and 1000000),
  from_date date not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (company_id, type, from_date)
);
create trigger company_rental_rates_append_only before update or delete on public.company_rental_rates
  for each row execute function public.reject_change();

create table public.company_rentals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  unit_id uuid not null references public.company_units (id),
  equipment_id uuid not null references public.company_equipment (id),
  customer_name text not null check (char_length(customer_name) between 3 and 80),
  started_at timestamptz not null default now(),
  hours smallint not null check (hours between 1 and 8),
  price_cents integer not null check (price_cents > 0),
  condition_out public.company_condition not null,
  returned_at timestamptz,
  condition_in public.company_condition,
  return_note text check (return_note is null or char_length(return_note) between 5 and 200),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint company_rentals_return_consistent check ((returned_at is null) = (condition_in is null))
);
create unique index company_rentals_one_active on public.company_rentals (equipment_id) where returned_at is null;
create index company_rentals_unit_idx on public.company_rentals (unit_id, started_at desc);

create table public.company_maintenance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  equipment_id uuid not null references public.company_equipment (id),
  description text not null check (char_length(description) between 5 and 200),
  status public.company_maintenance_status not null default 'open',
  cost_cents integer check (cost_cents is null or cost_cents >= 0),
  opened_by uuid not null references public.profiles (id),
  opened_at timestamptz not null default now(),
  closed_by uuid references public.profiles (id),
  closed_at timestamptz,
  constraint company_maintenance_closed_consistent check ((status = 'done') = (closed_at is not null))
);
create unique index company_maintenance_one_open on public.company_maintenance (equipment_id) where status = 'open';

-- Aluguel: preço, horas e saída ficam congelados; a devolução só preenche os campos de retorno, uma vez.
create function public.company_rentals_frozen() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.id, new.company_id, new.unit_id, new.equipment_id, new.customer_name, new.started_at, new.hours, new.price_cents, new.condition_out, new.created_by, new.created_at)
     is distinct from
     (old.id, old.company_id, old.unit_id, old.equipment_id, old.customer_name, old.started_at, old.hours, old.price_cents, old.condition_out, old.created_by, old.created_at) then
    raise exception 'A rental snapshot is frozen' using errcode = 'insufficient_privilege';
  end if;
  if old.returned_at is not null then raise exception 'A returned rental cannot change' using errcode = 'insufficient_privilege'; end if;
  return new;
end;
$$;
create trigger company_rentals_snapshot_frozen before update on public.company_rentals for each row execute function public.company_rentals_frozen();
create trigger company_rentals_no_delete before delete on public.company_rentals for each row execute function public.reject_change();

-- ---------------------------------------------------------------------------
-- Funções internas
-- ---------------------------------------------------------------------------
-- Situação derivada: aposentado > em manutenção > alugado > disponível.
create function public.company_equipment_status(p_equipment uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when e.retired then 'retired'
    when exists (select 1 from public.company_maintenance m where m.equipment_id = e.id and m.status = 'open') then 'maintenance'
    when exists (select 1 from public.company_rentals r where r.equipment_id = e.id and r.returned_at is null) then 'rented'
    else 'available' end
  from public.company_equipment e where e.id = p_equipment;
$$;
create function public.company_condition_rank(c public.company_condition) returns integer
language sql immutable set search_path = '' as $$ select case c when 'novo' then 0 when 'bom' then 1 when 'regular' then 2 else 3 end; $$;

-- ---------------------------------------------------------------------------
-- Escritas
-- ---------------------------------------------------------------------------
create function public.create_product(p_company uuid, p_sku text, p_name text, p_category text, p_price_cents integer, p_min_stock integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare pid uuid; s text := upper(trim(coalesce(p_sku, '')));
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if not public.company_any_permission(p_company, 'stock.adjust') then raise exception 'Not allowed' using errcode = '42501'; end if;
  insert into public.company_products (company_id, sku, name, category, price_cents, min_stock) values (p_company, s, trim(p_name), coalesce(trim(p_category), ''), p_price_cents, p_min_stock) returning id into pid;
  perform public.company_audit(p_company, null, 'product.created', s, jsonb_build_object('price_cents', p_price_cents));
  return pid;
end;
$$;

-- in e sale recebem quantidade POSITIVA (sale sai do estoque); adjust recebe a diferença, positiva ou negativa.
create function public.record_stock_movement(p_unit uuid, p_product uuid, p_type text, p_qty integer, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare u public.company_units; p public.company_products; signed integer;
begin
  select * into u from public.company_units where id = p_unit;
  select * into p from public.company_products where id = p_product;
  if u.id is null or p.id is null or p.company_id <> u.company_id or not u.active or not p.active then raise exception 'Unit or product not available' using errcode = '22023'; end if;
  if p_type not in ('in', 'sale', 'adjust') then raise exception 'Invalid movement type' using errcode = '22023'; end if;
  perform public.require_company_permission(p_unit, case when p_type = 'adjust' then 'stock.adjust' else 'stock.edit' end);
  if p_qty is null or p_qty = 0 or (p_type <> 'adjust' and p_qty < 0) then raise exception 'Invalid quantity' using errcode = '22023'; end if;
  signed := case when p_type = 'sale' then -p_qty else p_qty end;
  insert into public.company_stock_movements (company_id, unit_id, product_id, type, qty, note, created_by) values (u.company_id, p_unit, p_product, p_type::public.company_stock_type, signed, trim(coalesce(p_note, '')), auth.uid());
  perform public.company_audit(u.company_id, p_unit, 'stock.' || p_type, p.sku, jsonb_build_object('qty', signed));
end;
$$;

create function public.transfer_stock(p_product uuid, p_from uuid, p_to uuid, p_qty integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare a public.company_units; b public.company_units; p public.company_products; tid uuid := gen_random_uuid();
begin
  select * into a from public.company_units where id = p_from; select * into b from public.company_units where id = p_to; select * into p from public.company_products where id = p_product;
  if a.id is null or b.id is null or p.id is null or a.company_id <> b.company_id or p.company_id <> a.company_id or not a.active or not b.active or not p.active then raise exception 'Units or product not available' using errcode = '22023'; end if;
  if p_from = p_to then raise exception 'Origin and destination must differ' using errcode = '22023'; end if;
  if p_qty is null or p_qty < 1 then raise exception 'Invalid quantity' using errcode = '22023'; end if;
  perform public.require_company_permission(p_from, 'stock.edit');
  perform public.require_company_permission(p_to, 'stock.edit');
  -- Ordem fixa de inserção (por unidade) para que transferências opostas simultâneas não travem uma à outra.
  if p_from < p_to then
    insert into public.company_stock_movements (company_id, unit_id, product_id, type, qty, transfer_id, note, created_by) values (a.company_id, p_from, p_product, 'transfer_out', -p_qty, tid, 'Transferência enviada', auth.uid());
    insert into public.company_stock_movements (company_id, unit_id, product_id, type, qty, transfer_id, note, created_by) values (a.company_id, p_to, p_product, 'transfer_in', p_qty, tid, 'Transferência recebida', auth.uid());
  else
    insert into public.company_stock_movements (company_id, unit_id, product_id, type, qty, transfer_id, note, created_by) values (a.company_id, p_to, p_product, 'transfer_in', p_qty, tid, 'Transferência recebida', auth.uid());
    insert into public.company_stock_movements (company_id, unit_id, product_id, type, qty, transfer_id, note, created_by) values (a.company_id, p_from, p_product, 'transfer_out', -p_qty, tid, 'Transferência enviada', auth.uid());
  end if;
  perform public.company_audit(a.company_id, p_from, 'stock.transfer', p.sku, jsonb_build_object('to', p_to, 'qty', p_qty, 'transfer_id', tid));
  return tid;
end;
$$;

create function public.create_equipment(p_unit uuid, p_code text, p_type public.company_equipment_type, p_label text, p_condition public.company_condition) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u public.company_units; eid uuid; c text := upper(trim(coalesce(p_code, '')));
begin
  select * into u from public.company_units where id = p_unit;
  if u.id is null or not u.active then raise exception 'Unit not available' using errcode = '22023'; end if;
  perform public.require_company_permission(p_unit, 'stock.adjust');
  insert into public.company_equipment (company_id, unit_id, code, type, label, condition) values (u.company_id, p_unit, c, p_type, trim(p_label), p_condition) returning id into eid;
  perform public.company_audit(u.company_id, p_unit, 'equipment.created', c);
  return eid;
end;
$$;

create function public.set_rental_rate(p_company uuid, p_type public.company_equipment_type, p_cents integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if not public.company_any_permission(p_company, 'stock.adjust') then raise exception 'Not allowed' using errcode = '42501'; end if;
  insert into public.company_rental_rates (company_id, type, cents_per_hour, from_date, created_by) values (p_company, p_type, p_cents, (now() at time zone 'America/Fortaleza')::date, auth.uid());
  perform public.company_audit(p_company, null, 'rental.rate', p_type::text, jsonb_build_object('cents_per_hour', p_cents));
end;
$$;

create function public.start_rental(p_equipment uuid, p_customer text, p_hours integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare e public.company_equipment; rate integer; rid uuid; today date := (now() at time zone 'America/Fortaleza')::date;
begin
  select * into e from public.company_equipment where id = p_equipment for update;
  if not found then raise exception 'Equipment not found' using errcode = 'P0002'; end if;
  perform public.require_company_permission(e.unit_id, 'stock.edit');
  if p_hours is null or p_hours < 1 or p_hours > 8 then raise exception 'Rental of 1 to 8 hours' using errcode = '22023'; end if;
  if public.company_equipment_status(e.id) <> 'available' then raise exception 'Equipment is not available' using errcode = '55000'; end if;
  select cents_per_hour into rate from public.company_rental_rates where company_id = e.company_id and type = e.type and from_date <= today order by from_date desc limit 1;
  if rate is null then raise exception 'No rental rate in force for this equipment type' using errcode = 'P0002'; end if;
  insert into public.company_rentals (company_id, unit_id, equipment_id, customer_name, hours, price_cents, condition_out, created_by)
    values (e.company_id, e.unit_id, e.id, trim(p_customer), p_hours, rate * p_hours, e.condition, auth.uid()) returning id into rid;
  perform public.company_audit(e.company_id, e.unit_id, 'rental.started', e.code, jsonb_build_object('hours', p_hours, 'price_cents', rate * p_hours));
  return rid;
end;
$$;

create function public.return_rental(p_rental uuid, p_condition public.company_condition, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.company_rentals; e public.company_equipment; note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into r from public.company_rentals where id = p_rental for update;
  if not found then raise exception 'Rental not found' using errcode = 'P0002'; end if;
  perform public.require_company_permission(r.unit_id, 'stock.edit');
  if r.returned_at is not null then raise exception 'Already returned' using errcode = '55000'; end if;
  if public.company_condition_rank(p_condition) > public.company_condition_rank(r.condition_out) and char_length(coalesce(note, '')) < 5 then
    raise exception 'Describe the damage when it comes back worse' using errcode = '22023';
  end if;
  select * into e from public.company_equipment where id = r.equipment_id for update;
  update public.company_rentals set returned_at = now(), condition_in = p_condition, return_note = note where id = p_rental;
  update public.company_equipment set condition = p_condition where id = e.id;
  if p_condition = 'ruim' and not exists (select 1 from public.company_maintenance where equipment_id = e.id and status = 'open') then
    insert into public.company_maintenance (company_id, equipment_id, description, opened_by) values (e.company_id, e.id, left('Devolvido em estado ruim: ' || coalesce(note, 'sem detalhe'), 200), auth.uid());
  end if;
  perform public.company_audit(e.company_id, e.unit_id, 'rental.returned', e.code, jsonb_build_object('condition', p_condition));
end;
$$;

create function public.open_maintenance(p_equipment uuid, p_description text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare e public.company_equipment; mid uuid;
begin
  select * into e from public.company_equipment where id = p_equipment for update;
  if not found then raise exception 'Equipment not found' using errcode = 'P0002'; end if;
  perform public.require_company_permission(e.unit_id, 'stock.edit');
  if public.company_equipment_status(e.id) <> 'available' then raise exception 'Only an available equipment goes to maintenance' using errcode = '55000'; end if;
  insert into public.company_maintenance (company_id, equipment_id, description, opened_by) values (e.company_id, e.id, trim(p_description), auth.uid()) returning id into mid;
  perform public.company_audit(e.company_id, e.unit_id, 'maintenance.opened', e.code);
  return mid;
end;
$$;

create function public.close_maintenance(p_ticket uuid, p_cost_cents integer, p_condition public.company_condition) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.company_maintenance; e public.company_equipment;
begin
  select * into m from public.company_maintenance where id = p_ticket for update;
  if not found then raise exception 'Ticket not found' using errcode = 'P0002'; end if;
  select * into e from public.company_equipment where id = m.equipment_id for update;
  perform public.require_company_permission(e.unit_id, 'stock.edit');
  if m.status <> 'open' then raise exception 'Already closed' using errcode = '55000'; end if;
  update public.company_maintenance set status = 'done', cost_cents = p_cost_cents, closed_by = auth.uid(), closed_at = now() where id = p_ticket;
  update public.company_equipment set condition = p_condition where id = e.id;
  perform public.company_audit(e.company_id, e.unit_id, 'maintenance.closed', e.code, jsonb_build_object('cost_cents', p_cost_cents));
end;
$$;

create function public.retire_equipment(p_equipment uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.company_equipment;
begin
  select * into e from public.company_equipment where id = p_equipment for update;
  if not found then raise exception 'Equipment not found' using errcode = 'P0002'; end if;
  perform public.require_company_permission(e.unit_id, 'stock.adjust');
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'A reason is required' using errcode = '22023'; end if;
  if public.company_equipment_status(e.id) = 'rented' then raise exception 'Return the rental first' using errcode = '55000'; end if;
  if e.retired then raise exception 'Already retired' using errcode = '55000'; end if;
  update public.company_equipment set retired = true where id = e.id;
  perform public.company_audit(e.company_id, e.unit_id, 'equipment.retired', e.code, jsonb_build_object('reason', trim(p_reason)));
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS e concessões
-- ---------------------------------------------------------------------------
alter table public.company_products enable row level security;
alter table public.company_stock_balances enable row level security;
alter table public.company_stock_movements enable row level security;
alter table public.company_equipment enable row level security;
alter table public.company_rental_rates enable row level security;
alter table public.company_rentals enable row level security;
alter table public.company_maintenance enable row level security;

create policy company_products_select on public.company_products for select to authenticated using (public.company_any_permission(company_id, 'stock.view') or public.is_admin());
create policy company_stock_balances_select on public.company_stock_balances for select to authenticated using (public.company_has_permission(unit_id, 'stock.view') or public.is_admin());
create policy company_stock_movements_select on public.company_stock_movements for select to authenticated using (public.company_has_permission(unit_id, 'stock.view') or public.is_admin());
create policy company_equipment_select on public.company_equipment for select to authenticated using (public.company_has_permission(unit_id, 'stock.view') or public.is_admin());
create policy company_rental_rates_select on public.company_rental_rates for select to authenticated using (public.company_any_permission(company_id, 'stock.view') or public.is_admin());
create policy company_rentals_select on public.company_rentals for select to authenticated using (public.company_has_permission(unit_id, 'stock.view') or public.is_admin());
create policy company_maintenance_select on public.company_maintenance for select to authenticated using (exists (select 1 from public.company_equipment e where e.id = equipment_id));

revoke all on public.company_products, public.company_stock_balances, public.company_stock_movements, public.company_equipment, public.company_rental_rates, public.company_rentals, public.company_maintenance from public, anon, authenticated;
grant select on public.company_products, public.company_stock_balances, public.company_stock_movements, public.company_equipment, public.company_rental_rates, public.company_rentals, public.company_maintenance to authenticated;
revoke all on sequence public.company_stock_movements_id_seq, public.company_rental_rates_id_seq from public, anon, authenticated;

revoke all on function public.company_stock_apply(), public.company_rentals_frozen(), public.company_equipment_status(uuid), public.company_condition_rank(public.company_condition),
  public.create_product(uuid, text, text, text, integer, integer), public.record_stock_movement(uuid, uuid, text, integer, text), public.transfer_stock(uuid, uuid, uuid, integer),
  public.create_equipment(uuid, text, public.company_equipment_type, text, public.company_condition), public.set_rental_rate(uuid, public.company_equipment_type, integer),
  public.start_rental(uuid, text, integer), public.return_rental(uuid, public.company_condition, text), public.open_maintenance(uuid, text),
  public.close_maintenance(uuid, integer, public.company_condition), public.retire_equipment(uuid, text) from public, anon, authenticated;
grant execute on function public.create_product(uuid, text, text, text, integer, integer), public.record_stock_movement(uuid, uuid, text, integer, text), public.transfer_stock(uuid, uuid, uuid, integer),
  public.create_equipment(uuid, text, public.company_equipment_type, text, public.company_condition), public.set_rental_rate(uuid, public.company_equipment_type, integer),
  public.start_rental(uuid, text, integer), public.return_rental(uuid, public.company_condition, text), public.open_maintenance(uuid, text),
  public.close_maintenance(uuid, integer, public.company_condition), public.retire_equipment(uuid, text) to authenticated;
-- Internas (sem EXECUTE para o cliente): company_stock_apply, company_rentals_frozen, company_equipment_status, company_condition_rank.

notify pgrst, 'reload schema';
commit;
