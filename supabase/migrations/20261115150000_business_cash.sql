-- Vento | Business fase 4: caixa por unidade, movimentos, vendas ligadas ao estoque, recebimentos de
-- reservas e aluguéis, fechamento com conferência e arquivos do fechamento em Storage privado.
--
-- Depende das fases 1, 2 e 3. Só cria objetos novos (tabelas, funções, um bucket privado e suas
-- políticas); não altera nenhuma função nem tabela anterior.
--
-- Regras do projeto:
--  * Dinheiro em centavos inteiros. O caixa só soma o que é DINHEIRO; Pix e cartão são registrados
--    como recebidos fora do VentoKite (maquininha ou conta da escola) e nunca cobrados aqui.
--  * Valores de venda vêm do banco: produto (preço × quantidade), reserva presencial e aluguel
--    (valores congelados nas fases 2 e 3). O cliente só informa o valor de suprimento, sangria e
--    despesa, que é dinheiro físico contado.
--  * Um caixa aberto por unidade (índice único). Movimento só entra em caixa aberto, e o fechamento
--    trava o caixa: o esperado é calculado no banco com todos os movimentos aceitos, e nenhum entra
--    depois. Diferença exige motivo.
--  * Uma reserva ou um aluguel só é recebido uma vez (índice único).
--  * Arquivos do fechamento (Excel e PDF) num bucket privado, caminho <empresa>/<caixa>/fechamento.<ext>;
--    só lê quem pode ver o caixa; só grava quem fecha, uma vez, depois de fechado; ninguém altera nem apaga.
--  * Escrita só por função SECURITY DEFINER; tabelas sem INSERT/UPDATE/DELETE para o cliente; RLS em todas.
begin;

create type public.company_closing_mode as enum ('daily', 'shift', 'manual');
create type public.company_cash_kind as enum ('sale', 'supply', 'bleed', 'expense');
create type public.company_cash_method as enum ('cash', 'pix_external', 'card_external');
create type public.company_session_status as enum ('open', 'closed');

-- ---------------------------------------------------------------------------
-- Configuração por unidade
-- ---------------------------------------------------------------------------
create table public.company_cash_settings (
  unit_id uuid primary key references public.company_units (id),
  company_id uuid not null references public.companies (id),
  closing_mode public.company_closing_mode not null default 'daily',
  printer_width smallint not null default 80 check (printer_width in (58, 80)),
  print_purposes text[] not null default '{closing}'
    check (print_purposes <@ array['closing','sale','booking','rental','bleed','supply','external_payment']::text[]),
  updated_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sessões de caixa
-- ---------------------------------------------------------------------------
create table public.company_cash_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  unit_id uuid not null references public.company_units (id),
  operator_name text not null check (char_length(operator_name) between 3 and 80),
  opening_cents integer not null check (opening_cents between 0 and 5000000),
  status public.company_session_status not null default 'open',
  opened_by uuid not null references public.profiles (id),
  opened_at timestamptz not null default now(),
  closed_by uuid references public.profiles (id),
  closed_at timestamptz,
  expected_cents integer,
  counted_cents integer check (counted_cents is null or counted_cents between 0 and 100000000),
  difference_cents integer,
  closing_reason text,
  constraint company_cash_closed_consistent check (
    (status = 'open' and closed_at is null and expected_cents is null and counted_cents is null and difference_cents is null)
    or (status = 'closed' and closed_at is not null and closed_by is not null and expected_cents is not null and counted_cents is not null
        and difference_cents = counted_cents - expected_cents)),
  constraint company_cash_difference_reason check (
    difference_cents is null or difference_cents = 0 or char_length(coalesce(closing_reason, '')) >= 8)
);
create unique index company_cash_one_open on public.company_cash_sessions (unit_id) where status = 'open';
create index company_cash_sessions_unit_idx on public.company_cash_sessions (unit_id, opened_at desc);

-- Fechado não muda; aberto só muda para fechado (pela função de fechamento).
create function public.company_cash_sessions_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'closed' then raise exception 'A closed cash session cannot change' using errcode = 'insufficient_privilege'; end if;
  if (new.id, new.company_id, new.unit_id, new.operator_name, new.opening_cents, new.opened_by, new.opened_at)
     is distinct from (old.id, old.company_id, old.unit_id, old.operator_name, old.opening_cents, old.opened_by, old.opened_at) then
    raise exception 'The opening of a cash session is frozen' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger company_cash_sessions_frozen before update on public.company_cash_sessions for each row execute function public.company_cash_sessions_guard();
create trigger company_cash_sessions_no_delete before delete on public.company_cash_sessions for each row execute function public.reject_change();

-- ---------------------------------------------------------------------------
-- Movimentos (append-only)
-- ---------------------------------------------------------------------------
create table public.company_cash_movements (
  id bigserial primary key,
  session_id uuid not null references public.company_cash_sessions (id),
  company_id uuid not null references public.companies (id),
  unit_id uuid not null references public.company_units (id),
  kind public.company_cash_kind not null,
  method public.company_cash_method not null,
  cents integer not null check (cents between 1 and 10000000),
  note text not null check (char_length(note) between 3 and 160),
  stock_movement_id bigint unique references public.company_stock_movements (id),
  external_booking_id uuid unique references public.company_external_bookings (id),
  rental_id uuid unique references public.company_rentals (id),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  -- Venda tem exatamente uma origem com valor do banco; os outros tipos são dinheiro físico, sem origem.
  constraint company_cash_sale_origin check (
    (kind = 'sale' and num_nonnulls(stock_movement_id, external_booking_id, rental_id) = 1)
    or (kind <> 'sale' and method = 'cash' and num_nonnulls(stock_movement_id, external_booking_id, rental_id) = 0))
);
create index company_cash_movements_session_idx on public.company_cash_movements (session_id, created_at);

-- Só entra movimento em caixa aberto da mesma unidade. FOR SHARE espera um fechamento em andamento e
-- relê a sessão depois: se fechou, recusa. Assim nenhum movimento fica fora do esperado do fechamento.
create function public.company_cash_movement_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.company_cash_sessions s
    where s.id = new.session_id and s.status = 'open' and s.unit_id = new.unit_id and s.company_id = new.company_id
    for share;
  if not found then raise exception 'The cash session is not open' using errcode = '55000'; end if;
  return new;
end;
$$;
create trigger company_cash_movements_open_only before insert on public.company_cash_movements for each row execute function public.company_cash_movement_guard();
create trigger company_cash_movements_append_only before update or delete on public.company_cash_movements for each row execute function public.reject_change();

-- ---------------------------------------------------------------------------
-- Arquivos do fechamento
-- ---------------------------------------------------------------------------
create table public.company_cash_closing_files (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.company_cash_sessions (id),
  company_id uuid not null references public.companies (id),
  kind text not null check (kind in ('xlsx', 'pdf')),
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes integer not null check (bytes between 1 and 5242880),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (session_id, kind)
);
create trigger company_cash_closing_files_append_only before update or delete on public.company_cash_closing_files for each row execute function public.reject_change();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vento-business-closings', 'vento-business-closings', false, 5242880,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Funções internas
-- ---------------------------------------------------------------------------
create function public.company_cash_expected(p_session uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select s.opening_cents
    + coalesce(sum(m.cents) filter (where m.kind = 'sale' and m.method = 'cash'), 0)
    + coalesce(sum(m.cents) filter (where m.kind = 'supply'), 0)
    - coalesce(sum(m.cents) filter (where m.kind in ('bleed', 'expense')), 0)
  from public.company_cash_sessions s left join public.company_cash_movements m on m.session_id = s.id
  where s.id = p_session group by s.opening_cents;
$$;

-- Trava o caixa aberto e confere a permissão na unidade dele. Devolve a sessão.
create function public.company_cash_lock(p_session uuid, p_permission text) returns public.company_cash_sessions
language plpgsql security definer set search_path = '' as $$
declare s public.company_cash_sessions;
begin
  select * into s from public.company_cash_sessions where id = p_session for update;
  if not found then raise exception 'Cash session not found' using errcode = 'P0002'; end if;
  perform public.require_company_permission(s.unit_id, p_permission);
  if s.status <> 'open' then raise exception 'The cash session is not open' using errcode = '55000'; end if;
  return s;
end;
$$;

-- Acesso a um arquivo do bucket de fechamentos, usado pelas políticas do Storage.
-- Caminho: <empresa>/<caixa>/fechamento.xlsx|pdf
create function public.company_closing_object_access(p_name text, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := string_to_array(coalesce(p_name, ''), '/'); s public.company_cash_sessions; v_kind text;
begin
  if auth.uid() is null or cardinality(parts) <> 3 or parts[3] !~ '^fechamento\.(xlsx|pdf)$'
     or parts[1] !~ '^[0-9a-f-]{36}$' or parts[2] !~ '^[0-9a-f-]{36}$' then return false; end if;
  select * into s from public.company_cash_sessions where id = parts[2]::uuid and company_id = parts[1]::uuid;
  if s.id is null then return false; end if;
  if not p_write then
    return public.company_has_permission(s.unit_id, 'cash.close') or public.company_has_permission(s.unit_id, 'finance.reports') or public.is_admin();
  end if;
  v_kind := substring(parts[3] from '\.(xlsx|pdf)$');
  return s.status = 'closed' and public.company_has_permission(s.unit_id, 'cash.close')
    and not exists (select 1 from public.company_cash_closing_files f where f.session_id = s.id and f.kind = v_kind);
end;
$$;

-- ---------------------------------------------------------------------------
-- Escritas
-- ---------------------------------------------------------------------------
create function public.set_cash_settings(p_unit uuid, p_mode public.company_closing_mode, p_width integer, p_purposes text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare u public.company_units;
begin
  select * into u from public.company_units where id = p_unit;
  if u.id is null then raise exception 'Unit not found' using errcode = 'P0002'; end if;
  perform public.require_company_permission(p_unit, 'cash.close');
  insert into public.company_cash_settings (unit_id, company_id, closing_mode, printer_width, print_purposes, updated_by)
    values (p_unit, u.company_id, p_mode, p_width, coalesce(p_purposes, '{closing}'), auth.uid())
    on conflict (unit_id) do update set closing_mode = excluded.closing_mode, printer_width = excluded.printer_width,
      print_purposes = excluded.print_purposes, updated_by = excluded.updated_by, updated_at = now();
  perform public.company_audit(u.company_id, p_unit, 'cash.settings', p_mode::text, jsonb_build_object('printer_width', p_width));
end;
$$;

create function public.open_cash_session(p_unit uuid, p_opening_cents integer, p_operator text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u public.company_units; mode public.company_closing_mode; sid uuid; today date := (now() at time zone 'America/Fortaleza')::date;
begin
  select * into u from public.company_units where id = p_unit for update; -- serializa aberturas da unidade
  if u.id is null or not u.active then raise exception 'Unit not available' using errcode = '22023'; end if;
  perform public.require_company_permission(p_unit, 'cash.operate');
  if exists (select 1 from public.company_cash_sessions where unit_id = p_unit and status = 'open') then
    raise exception 'This unit already has an open cash session' using errcode = '55000';
  end if;
  select closing_mode into mode from public.company_cash_settings where unit_id = p_unit;
  if coalesce(mode, 'daily') = 'daily' and exists (select 1 from public.company_cash_sessions
      where unit_id = p_unit and (opened_at at time zone 'America/Fortaleza')::date = today) then
    raise exception 'Daily closing: this unit already had a cash session today' using errcode = '55000';
  end if;
  insert into public.company_cash_sessions (company_id, unit_id, operator_name, opening_cents, opened_by)
    values (u.company_id, p_unit, trim(coalesce(p_operator, '')), p_opening_cents, auth.uid()) returning id into sid;
  perform public.company_audit(u.company_id, p_unit, 'cash.opened', sid::text, jsonb_build_object('opening_cents', p_opening_cents));
  return sid;
end;
$$;

-- Suprimento, sangria e despesa: dinheiro físico, valor contado pelo operador. O dinheiro na gaveta nunca fica negativo.
create function public.record_cash_movement(p_session uuid, p_kind public.company_cash_kind, p_cents integer, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.company_cash_sessions;
begin
  if p_kind = 'sale' then raise exception 'Sales come from a product, booking or rental' using errcode = '22023'; end if;
  s := public.company_cash_lock(p_session, 'cash.operate');
  if p_cents is null or p_cents < 1 then raise exception 'Invalid amount' using errcode = '22023'; end if;
  if p_kind in ('bleed', 'expense') and public.company_cash_expected(p_session) - p_cents < 0 then
    raise exception 'Not enough cash in the drawer' using errcode = '55000';
  end if;
  insert into public.company_cash_movements (session_id, company_id, unit_id, kind, method, cents, note, created_by)
    values (s.id, s.company_id, s.unit_id, p_kind, 'cash', p_cents, trim(coalesce(p_note, '')), auth.uid());
  perform public.company_audit(s.company_id, s.unit_id, 'cash.' || p_kind, s.id::text, jsonb_build_object('cents', p_cents));
end;
$$;

-- Venda de produto: o valor é preço × quantidade do banco, e a saída do estoque acontece na mesma transação.
create function public.sell_product(p_session uuid, p_product uuid, p_qty integer, p_method public.company_cash_method) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.company_cash_sessions; p public.company_products; smid bigint;
begin
  s := public.company_cash_lock(p_session, 'cash.operate');
  perform public.require_company_permission(s.unit_id, 'stock.edit');
  select * into p from public.company_products where id = p_product and company_id = s.company_id and active;
  if p.id is null then raise exception 'Product not available' using errcode = '22023'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 1000 then raise exception 'Invalid quantity' using errcode = '22023'; end if;
  insert into public.company_stock_movements (company_id, unit_id, product_id, type, qty, note, created_by)
    values (s.company_id, s.unit_id, p.id, 'sale', -p_qty, 'Venda no caixa', auth.uid()) returning id into smid;
  insert into public.company_cash_movements (session_id, company_id, unit_id, kind, method, cents, note, stock_movement_id, created_by)
    values (s.id, s.company_id, s.unit_id, 'sale', p_method, p.price_cents * p_qty, left(p_qty || ' x ' || p.name, 160), smid, auth.uid());
  perform public.company_audit(s.company_id, s.unit_id, 'cash.sale', p.sku, jsonb_build_object('qty', p_qty, 'cents', p.price_cents * p_qty, 'method', p_method));
end;
$$;

-- Recebimento de reserva presencial: valor congelado da reserva; uma vez só.
create function public.record_booking_payment(p_session uuid, p_booking uuid, p_method public.company_cash_method) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.company_cash_sessions; b public.company_external_bookings;
begin
  s := public.company_cash_lock(p_session, 'cash.operate');
  select * into b from public.company_external_bookings where id = p_booking;
  if b.id is null or b.unit_id <> s.unit_id or b.status = 'cancelled' then raise exception 'Booking not payable in this cash session' using errcode = '22023'; end if;
  insert into public.company_cash_movements (session_id, company_id, unit_id, kind, method, cents, note, external_booking_id, created_by)
    values (s.id, s.company_id, s.unit_id, 'sale', p_method, b.price_cents, 'Reserva ' || b.code, b.id, auth.uid());
  perform public.company_audit(s.company_id, s.unit_id, 'cash.booking_paid', b.code, jsonb_build_object('cents', b.price_cents, 'method', p_method));
end;
$$;

-- Recebimento de aluguel: valor congelado do aluguel; uma vez só.
create function public.record_rental_payment(p_session uuid, p_rental uuid, p_method public.company_cash_method) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.company_cash_sessions; r public.company_rentals;
begin
  s := public.company_cash_lock(p_session, 'cash.operate');
  select * into r from public.company_rentals where id = p_rental;
  if r.id is null or r.unit_id <> s.unit_id then raise exception 'Rental not payable in this cash session' using errcode = '22023'; end if;
  insert into public.company_cash_movements (session_id, company_id, unit_id, kind, method, cents, note, rental_id, created_by)
    values (s.id, s.company_id, s.unit_id, 'sale', p_method, r.price_cents, 'Aluguel de equipamento', r.id, auth.uid());
  perform public.company_audit(s.company_id, s.unit_id, 'cash.rental_paid', r.id::text, jsonb_build_object('cents', r.price_cents, 'method', p_method));
end;
$$;

-- Fechamento: esperado calculado no banco com o caixa travado; diferença = contado − esperado; diferença exige motivo.
create function public.close_cash_session(p_session uuid, p_counted_cents integer, p_reason text) returns integer
language plpgsql security definer set search_path = '' as $$
declare s public.company_cash_sessions; expected integer; diff integer; reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  s := public.company_cash_lock(p_session, 'cash.close');
  if p_counted_cents is null or p_counted_cents < 0 then raise exception 'Invalid counted amount' using errcode = '22023'; end if;
  expected := public.company_cash_expected(p_session);
  diff := p_counted_cents - expected;
  if diff <> 0 and char_length(coalesce(reason, '')) < 8 then raise exception 'A difference needs a reason' using errcode = '22023'; end if;
  update public.company_cash_sessions set status = 'closed', closed_by = auth.uid(), closed_at = now(),
    expected_cents = expected, counted_cents = p_counted_cents, difference_cents = diff, closing_reason = reason where id = p_session;
  perform public.company_audit(s.company_id, s.unit_id, 'cash.closed', s.id::text, jsonb_build_object('expected_cents', expected, 'counted_cents', p_counted_cents, 'difference_cents', diff));
  return diff;
end;
$$;

-- Registra um arquivo já enviado ao bucket privado. Uma vez por tipo; só depois do fechamento.
create function public.register_closing_file(p_session uuid, p_kind text, p_sha256 text, p_bytes integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s public.company_cash_sessions; path text; fid uuid;
begin
  select * into s from public.company_cash_sessions where id = p_session for update;
  if not found then raise exception 'Cash session not found' using errcode = 'P0002'; end if;
  perform public.require_company_permission(s.unit_id, 'cash.close');
  if s.status <> 'closed' then raise exception 'Close the cash session first' using errcode = '55000'; end if;
  if p_kind not in ('xlsx', 'pdf') then raise exception 'Invalid file kind' using errcode = '22023'; end if;
  path := s.company_id::text || '/' || s.id::text || '/fechamento.' || p_kind;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'vento-business-closings' and o.name = path) then
    raise exception 'Upload the file first' using errcode = 'P0002';
  end if;
  insert into public.company_cash_closing_files (session_id, company_id, kind, storage_path, sha256, bytes, created_by)
    values (s.id, s.company_id, p_kind, path, lower(p_sha256), p_bytes, auth.uid()) returning id into fid;
  perform public.company_audit(s.company_id, s.unit_id, 'cash.file', s.id::text, jsonb_build_object('kind', p_kind, 'bytes', p_bytes));
  return fid;
end;
$$;

-- Totais de um caixa para a tela e o relatório; só para quem pode ver o caixa.
create function public.cash_session_totals(p_session uuid)
returns table (sales_cash_cents integer, sales_pix_cents integer, sales_card_cents integer, supplies_cents integer, bleeds_cents integer, expenses_cents integer, expected_cents integer)
language plpgsql stable security definer set search_path = '' as $$
declare s public.company_cash_sessions;
begin
  select * into s from public.company_cash_sessions where id = p_session;
  if s.id is null or not (public.company_has_permission(s.unit_id, 'cash.operate') or public.company_has_permission(s.unit_id, 'finance.reports') or public.is_admin()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query select
    coalesce(sum(m.cents) filter (where m.kind = 'sale' and m.method = 'cash'), 0)::integer,
    coalesce(sum(m.cents) filter (where m.kind = 'sale' and m.method = 'pix_external'), 0)::integer,
    coalesce(sum(m.cents) filter (where m.kind = 'sale' and m.method = 'card_external'), 0)::integer,
    coalesce(sum(m.cents) filter (where m.kind = 'supply'), 0)::integer,
    coalesce(sum(m.cents) filter (where m.kind = 'bleed'), 0)::integer,
    coalesce(sum(m.cents) filter (where m.kind = 'expense'), 0)::integer,
    public.company_cash_expected(p_session)
  from public.company_cash_movements m where m.session_id = p_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS, Storage e concessões
-- ---------------------------------------------------------------------------
alter table public.company_cash_settings enable row level security;
alter table public.company_cash_sessions enable row level security;
alter table public.company_cash_movements enable row level security;
alter table public.company_cash_closing_files enable row level security;

create policy company_cash_settings_select on public.company_cash_settings for select to authenticated
  using (public.company_has_permission(unit_id, 'cash.operate') or public.company_has_permission(unit_id, 'cash.close') or public.is_admin());
create policy company_cash_sessions_select on public.company_cash_sessions for select to authenticated
  using (public.company_has_permission(unit_id, 'cash.operate') or public.company_has_permission(unit_id, 'finance.reports') or public.is_admin());
create policy company_cash_movements_select on public.company_cash_movements for select to authenticated
  using (public.company_has_permission(unit_id, 'cash.operate') or public.company_has_permission(unit_id, 'finance.reports') or public.is_admin());
create policy company_cash_closing_files_select on public.company_cash_closing_files for select to authenticated
  using (exists (select 1 from public.company_cash_sessions s where s.id = session_id
    and (public.company_has_permission(s.unit_id, 'cash.close') or public.company_has_permission(s.unit_id, 'finance.reports'))) or public.is_admin());

-- Storage: lê quem pode ver o caixa; grava quem fecha, depois de fechado, uma vez por tipo. Sem UPDATE nem DELETE.
create policy vento_business_closings_read on storage.objects for select to authenticated
  using (bucket_id = 'vento-business-closings' and public.company_closing_object_access(name, false));
create policy vento_business_closings_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'vento-business-closings' and public.company_closing_object_access(name, true));

revoke all on public.company_cash_settings, public.company_cash_sessions, public.company_cash_movements, public.company_cash_closing_files from public, anon, authenticated;
grant select on public.company_cash_settings, public.company_cash_sessions, public.company_cash_movements, public.company_cash_closing_files to authenticated;
revoke all on sequence public.company_cash_movements_id_seq from public, anon, authenticated;

revoke all on function public.company_cash_sessions_guard(), public.company_cash_movement_guard(), public.company_cash_expected(uuid), public.company_cash_lock(uuid, text),
  public.company_closing_object_access(text, boolean), public.set_cash_settings(uuid, public.company_closing_mode, integer, text[]),
  public.open_cash_session(uuid, integer, text), public.record_cash_movement(uuid, public.company_cash_kind, integer, text),
  public.sell_product(uuid, uuid, integer, public.company_cash_method), public.record_booking_payment(uuid, uuid, public.company_cash_method),
  public.record_rental_payment(uuid, uuid, public.company_cash_method), public.close_cash_session(uuid, integer, text),
  public.register_closing_file(uuid, text, text, integer), public.cash_session_totals(uuid) from public, anon, authenticated;
grant execute on function public.set_cash_settings(uuid, public.company_closing_mode, integer, text[]), public.open_cash_session(uuid, integer, text),
  public.record_cash_movement(uuid, public.company_cash_kind, integer, text), public.sell_product(uuid, uuid, integer, public.company_cash_method),
  public.record_booking_payment(uuid, uuid, public.company_cash_method), public.record_rental_payment(uuid, uuid, public.company_cash_method),
  public.close_cash_session(uuid, integer, text), public.register_closing_file(uuid, text, text, integer), public.cash_session_totals(uuid) to authenticated;
-- As políticas do Storage chamam esta função como o usuário logado.
grant execute on function public.company_closing_object_access(text, boolean) to authenticated;
-- Internas (sem EXECUTE para o cliente): company_cash_sessions_guard, company_cash_movement_guard, company_cash_expected, company_cash_lock.

notify pgrst, 'reload schema';
commit;
