-- Vento | Business fase 2: serviços e preços por unidade, pacotes e reservas
-- presenciais, com a agenda única do instrutor.
--
-- Depende da fase 1 (20261115120000_business_company_core). Cria objetos novos e
-- faz UMA mudança no fluxo digital: instructor_can_attend passa a considerar
-- também as reservas presenciais confirmadas, para que o instrutor nunca fique
-- em dois lugares ao mesmo tempo. Tudo o que a função já checava continua igual.
--
-- Regras do projeto:
--  * Valores calculados no banco: o cliente envia escolhas (unidade, serviço,
--    instrutor, horário), nunca um valor. Preço da versão vigente; comissão da
--    versão vigente do instrutor; comissão calculada uma vez e o repasse da
--    escola por subtração (CHECK garante que as partes somam o total).
--  * Reserva tem valor congelado (trigger); preço novo é uma nova linha em
--    company_service_prices (append-only), nunca edição.
--  * Escrita só por função SECURITY DEFINER; tabelas sem INSERT/UPDATE/DELETE
--    para o cliente; RLS em todas.
--  * Outra empresa só aparece como "ocupado" (instructor_busy_intervals): nunca
--    cliente, serviço, unidade, valor nem código.
--  * Sem pagamento: a reserva presencial registra o atendimento; o recebimento
--    é fora do VentoKite.
begin;

create type public.company_booking_status as enum ('confirmed', 'done', 'cancelled');

-- ---------------------------------------------------------------------------
-- Serviços, preços (versões), configuração por unidade e pacotes
-- ---------------------------------------------------------------------------
create table public.company_services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name text not null check (char_length(name) between 3 and 60),
  minutes smallint not null check (minutes between 30 and 480 and minutes % 15 = 0),
  capacity smallint not null check (capacity between 1 and 10),
  description text not null default '' check (char_length(description) <= 300),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);
-- unit_id nulo = preço base. Uma versão nunca é editada nem apagada.
create table public.company_service_prices (
  id bigserial primary key,
  service_id uuid not null references public.company_services (id),
  unit_id uuid references public.company_units (id),
  cents integer not null check (cents between 1000 and 5000000),
  from_date date not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create unique index company_service_prices_one_per_day on public.company_service_prices (service_id, coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid), from_date);

create table public.company_unit_services (
  service_id uuid not null references public.company_services (id),
  unit_id uuid not null references public.company_units (id),
  place text not null default '' check (char_length(place) <= 120),
  weekdays smallint[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  active boolean not null default true,
  primary key (service_id, unit_id)
);
create table public.company_unit_service_instructors (
  service_id uuid not null,
  unit_id uuid not null,
  link_id uuid not null references public.company_instructor_links (id),
  primary key (service_id, unit_id, link_id),
  foreign key (service_id, unit_id) references public.company_unit_services (service_id, unit_id)
);
create table public.company_packages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  service_id uuid not null references public.company_services (id),
  name text not null check (char_length(name) between 3 and 60),
  lessons smallint not null check (lessons between 2 and 20),
  price_cents integer not null check (price_cents between 1000 and 10000000),
  valid_days smallint not null check (valid_days between 7 and 365),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Reservas presenciais (valor congelado)
-- ---------------------------------------------------------------------------
create sequence public.company_booking_seq;
create table public.company_external_bookings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('PRE-' || lpad(nextval('public.company_booking_seq')::text, 6, '0')),
  company_id uuid not null references public.companies (id),
  unit_id uuid not null references public.company_units (id),
  service_id uuid not null references public.company_services (id),
  instructor_id uuid not null references public.instructors (id),
  link_id uuid not null references public.company_instructor_links (id),
  customer_name text not null check (char_length(customer_name) between 3 and 80),
  customer_phone text not null check (customer_phone ~ '^[0-9]{10,13}$'),
  starts_at timestamptz not null,
  minutes smallint not null check (minutes between 30 and 480),
  status public.company_booking_status not null default 'confirmed',
  -- Congelado na criação. Nada daqui muda depois (trigger).
  price_cents integer not null check (price_cents > 0),
  commission_bps integer not null check (commission_bps between 1000 and 9000),
  commission_cents integer not null check (commission_cents >= 0),
  school_cents integer not null check (school_cents >= 0),
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) between 5 and 200),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint company_bookings_split_reconciles check (commission_cents + school_cents = price_cents),
  constraint company_bookings_commission_matches_rate check (commission_cents = (price_cents::bigint * commission_bps / 10000)),
  constraint company_bookings_cancel_consistent check ((status = 'cancelled') = (cancelled_at is not null and cancel_reason is not null))
);
create index company_bookings_instructor_idx on public.company_external_bookings (instructor_id, starts_at) where status = 'confirmed';
create index company_bookings_unit_idx on public.company_external_bookings (unit_id, starts_at desc);

create function public.company_bookings_frozen() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.id, new.code, new.company_id, new.unit_id, new.service_id, new.instructor_id, new.link_id, new.customer_name, new.customer_phone,
      new.minutes, new.price_cents, new.commission_bps, new.commission_cents, new.school_cents, new.created_by, new.created_at)
     is distinct from
     (old.id, old.code, old.company_id, old.unit_id, old.service_id, old.instructor_id, old.link_id, old.customer_name, old.customer_phone,
      old.minutes, old.price_cents, old.commission_bps, old.commission_cents, old.school_cents, old.created_by, old.created_at) then
    raise exception 'A booking snapshot is frozen' using errcode = 'insufficient_privilege';
  end if;
  if old.status <> 'confirmed' and (new.status is distinct from old.status or new.starts_at is distinct from old.starts_at) then
    raise exception 'A closed booking cannot change' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger company_bookings_snapshot_frozen before update on public.company_external_bookings
  for each row execute function public.company_bookings_frozen();
create trigger company_bookings_no_delete before delete on public.company_external_bookings
  for each row execute function public.reject_change();
create trigger company_service_prices_append_only before update or delete on public.company_service_prices
  for each row execute function public.reject_change();

-- ---------------------------------------------------------------------------
-- Funções internas
-- ---------------------------------------------------------------------------
create function public.company_service_price_cents(p_service uuid, p_unit uuid, p_on date) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select cents from public.company_service_prices where service_id = p_service and unit_id = p_unit and from_date <= p_on order by from_date desc limit 1),
    (select cents from public.company_service_prices where service_id = p_service and unit_id is null and from_date <= p_on order by from_date desc limit 1));
$$;
create function public.company_rate_bps(p_link uuid, p_unit uuid, p_on date) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select bps from public.company_instructor_rates where link_id = p_link and unit_id = p_unit and from_date <= p_on order by from_date desc limit 1),
    (select bps from public.company_instructor_rates where link_id = p_link and unit_id is null and from_date <= p_on order by from_date desc limit 1));
$$;

-- Mesma regra do fluxo digital (instructor_can_attend), com minutos, e olhando TODAS as reservas
-- presenciais confirmadas de qualquer empresa. Devolve só sim ou não.
create function public.company_instructor_is_free(p_instructor uuid, p_start timestamptz, p_minutes integer, p_ignore uuid default null) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare en timestamptz := p_start + make_interval(mins => p_minutes); ls timestamp := p_start at time zone 'America/Fortaleza'; le timestamp := en at time zone 'America/Fortaleza';
  buff integer := 0; configured boolean;
begin
  select buffer_minutes into buff from public.instructor_schedule_settings where instructor_id = p_instructor;
  configured := found; buff := coalesce(buff, 0);
  if configured and not exists (select 1 from public.instructor_weekly_hours h where h.instructor_id = p_instructor and h.weekday = extract(dow from ls)::integer
      and ls::date = le::date and ls::time >= h.opens_at and le::time <= h.closes_at) then return false; end if;
  if exists (select 1 from public.instructor_time_off t where t.instructor_id = p_instructor and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(p_start, en, '[)')) then return false; end if;
  if exists (select 1 from public.booking_meetings m join public.bookings b on b.id = m.booking_id
      where b.instructor_id = p_instructor and m.status <> 'cancelled'
        and (b.status = 'confirmed' or (b.status = 'awaiting_payment' and b.created_at >= now() - interval '10 minutes'))
        and tstzrange(m.starts_at - make_interval(mins => buff), m.starts_at + make_interval(mins => m.minutes + buff), '[)') && tstzrange(p_start, en, '[)')) then return false; end if;
  if exists (select 1 from public.company_external_bookings e where e.instructor_id = p_instructor and e.status = 'confirmed' and e.id is distinct from p_ignore
      and tstzrange(e.starts_at - make_interval(mins => buff), e.starts_at + make_interval(mins => e.minutes + buff), '[)') && tstzrange(p_start, en, '[)')) then return false; end if;
  return true;
end;
$$;

-- Validações comuns de criar e remarcar. Falhas de agenda usam uma mensagem única: não revela de quem é o horário.
create function public.company_check_slot(p_unit uuid, p_service uuid, p_instructor uuid, p_start timestamptz, p_ignore uuid)
returns table (company_id uuid, link_id uuid, minutes integer)
language plpgsql security definer set search_path = '' as $$
declare u public.company_units; s public.company_services; us public.company_unit_services; l public.company_instructor_links; ls timestamp; le timestamp;
begin
  select * into u from public.company_units where id = p_unit;
  select * into s from public.company_services where id = p_service;
  if u.id is null or s.id is null or s.company_id <> u.company_id or not u.active or not s.active then raise exception 'Unit or service not available' using errcode = '22023'; end if;
  select * into us from public.company_unit_services where service_id = p_service and unit_id = p_unit and active;
  if us.service_id is null then raise exception 'Service not enabled in this unit' using errcode = '22023'; end if;
  select l2.* into l from public.company_instructor_links l2
    join public.company_unit_service_instructors usi on usi.link_id = l2.id and usi.service_id = p_service and usi.unit_id = p_unit
    where l2.company_id = u.company_id and l2.instructor_id = p_instructor and l2.status = 'active'
      and exists (select 1 from public.company_instructor_units iu where iu.link_id = l2.id and iu.unit_id = p_unit)
      and exists (select 1 from public.instructors i where i.id = p_instructor and i.status = 'approved');
  if l.id is null then raise exception 'Instructor cannot attend this service here' using errcode = '22023'; end if;
  if p_start <= now() then raise exception 'Choose a future time' using errcode = '22023'; end if;
  ls := p_start at time zone 'America/Fortaleza'; le := (p_start + make_interval(mins => s.minutes)) at time zone 'America/Fortaleza';
  if not (extract(dow from ls)::smallint = any (us.weekdays)) or ls::date <> le::date or ls::time < u.opens or le::time > u.closes then raise exception 'Outside the unit service hours' using errcode = '22023'; end if;
  perform 1 from public.instructors where id = p_instructor for update; -- mesma trava do fluxo digital
  if not public.company_instructor_is_free(p_instructor, p_start, s.minutes, p_ignore) then raise exception 'Instructor not available at this time' using errcode = '23P01'; end if;
  return query select u.company_id, l.id, s.minutes::integer;
end;
$$;

-- ---------------------------------------------------------------------------
-- Escritas
-- ---------------------------------------------------------------------------
create function public.create_service(p_company uuid, p_name text, p_minutes integer, p_capacity integer, p_description text, p_base_cents integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if not public.company_any_permission(p_company, 'units.edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  insert into public.company_services (company_id, name, minutes, capacity, description) values (p_company, trim(p_name), p_minutes, p_capacity, coalesce(trim(p_description), '')) returning id into sid;
  insert into public.company_service_prices (service_id, unit_id, cents, from_date, created_by) values (sid, null, p_base_cents, (now() at time zone 'America/Fortaleza')::date, auth.uid());
  perform public.company_audit(p_company, null, 'service.created', trim(p_name), jsonb_build_object('base_cents', p_base_cents));
  return sid;
end;
$$;

-- Nova versão de preço a partir de hoje (Fortaleza). p_unit nulo = preço base (só quem edita o serviço na empresa).
create function public.set_service_price(p_service uuid, p_unit uuid, p_cents integer) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.company_services;
begin
  select * into s from public.company_services where id = p_service;
  if not found then raise exception 'Service not found' using errcode = 'P0002'; end if;
  if p_unit is null then
    if not public.company_any_permission(s.company_id, 'units.edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  else
    if not exists (select 1 from public.company_units where id = p_unit and company_id = s.company_id) then raise exception 'Unit not in this company' using errcode = '22023'; end if;
    perform public.require_company_permission(p_unit, 'units.edit');
  end if;
  insert into public.company_service_prices (service_id, unit_id, cents, from_date, created_by) values (p_service, p_unit, p_cents, (now() at time zone 'America/Fortaleza')::date, auth.uid());
  perform public.company_audit(s.company_id, p_unit, 'service.price', s.name, jsonb_build_object('cents', p_cents));
end;
$$;

create function public.set_unit_service(p_service uuid, p_unit uuid, p_place text, p_weekdays smallint[], p_link_ids uuid[], p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.company_services; l uuid;
begin
  select * into s from public.company_services where id = p_service;
  if not found or not exists (select 1 from public.company_units where id = p_unit and company_id = s.company_id) then raise exception 'Service or unit not found' using errcode = 'P0002'; end if;
  perform public.require_company_permission(p_unit, 'units.edit');
  foreach l in array coalesce(p_link_ids, '{}') loop
    if not exists (select 1 from public.company_instructor_links k join public.company_instructor_units iu on iu.link_id = k.id and iu.unit_id = p_unit where k.id = l and k.company_id = s.company_id and k.status = 'active') then
      raise exception 'Instructor link not active in this unit' using errcode = '22023';
    end if;
  end loop;
  insert into public.company_unit_services (service_id, unit_id, place, weekdays, active) values (p_service, p_unit, coalesce(trim(p_place), ''), p_weekdays, coalesce(p_active, true))
    on conflict (service_id, unit_id) do update set place = excluded.place, weekdays = excluded.weekdays, active = excluded.active;
  delete from public.company_unit_service_instructors where service_id = p_service and unit_id = p_unit;
  foreach l in array coalesce(p_link_ids, '{}') loop insert into public.company_unit_service_instructors (service_id, unit_id, link_id) values (p_service, p_unit, l); end loop;
  perform public.company_audit(s.company_id, p_unit, 'service.unit', s.name, jsonb_build_object('active', p_active, 'instructors', coalesce(cardinality(p_link_ids), 0)));
end;
$$;

create function public.create_package(p_service uuid, p_name text, p_lessons integer, p_price_cents integer, p_valid_days integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s public.company_services; pid uuid;
begin
  select * into s from public.company_services where id = p_service;
  if not found then raise exception 'Service not found' using errcode = 'P0002'; end if;
  if not public.company_any_permission(s.company_id, 'units.edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  insert into public.company_packages (company_id, service_id, name, lessons, price_cents, valid_days) values (s.company_id, p_service, trim(p_name), p_lessons, p_price_cents, p_valid_days) returning id into pid;
  perform public.company_audit(s.company_id, null, 'package.created', trim(p_name), jsonb_build_object('price_cents', p_price_cents, 'lessons', p_lessons));
  return pid;
end;
$$;
create function public.set_package_active(p_package uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.company_packages;
begin
  select * into p from public.company_packages where id = p_package for update;
  if not found then raise exception 'Package not found' using errcode = 'P0002'; end if;
  if not public.company_any_permission(p.company_id, 'units.edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  update public.company_packages set active = p_active where id = p_package;
  perform public.company_audit(p.company_id, null, 'package.active', p.name, jsonb_build_object('active', p_active));
end;
$$;

-- O cliente envia escolhas; preço, comissão e repasse saem do banco.
create function public.create_external_booking(p_unit uuid, p_service uuid, p_instructor uuid, p_customer text, p_phone text, p_starts timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare chk record; today date := (now() at time zone 'America/Fortaleza')::date; price integer; bps integer; comm integer; bid uuid; phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  perform public.require_company_permission(p_unit, 'agenda.edit');
  select * into chk from public.company_check_slot(p_unit, p_service, p_instructor, p_starts, null);
  price := public.company_service_price_cents(p_service, p_unit, today);
  bps := public.company_rate_bps(chk.link_id, p_unit, today);
  if price is null or bps is null then raise exception 'No price or commission in force' using errcode = 'P0002'; end if;
  comm := (price::bigint * bps / 10000)::integer;
  insert into public.company_external_bookings (company_id, unit_id, service_id, instructor_id, link_id, customer_name, customer_phone, starts_at, minutes, price_cents, commission_bps, commission_cents, school_cents, created_by)
    values (chk.company_id, p_unit, p_service, p_instructor, chk.link_id, trim(p_customer), phone, p_starts, chk.minutes, price, bps, comm, price - comm, auth.uid()) returning id into bid;
  perform public.company_audit(chk.company_id, p_unit, 'booking.created', bid::text, jsonb_build_object('price_cents', price));
  return bid;
end;
$$;

create function public.reschedule_external_booking(p_booking uuid, p_starts timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.company_external_bookings; chk record;
begin
  select * into b from public.company_external_bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  perform public.require_company_permission(b.unit_id, 'agenda.edit');
  if b.status <> 'confirmed' then raise exception 'Only a confirmed booking is rescheduled' using errcode = '55000'; end if;
  select * into chk from public.company_check_slot(b.unit_id, b.service_id, b.instructor_id, p_starts, b.id);
  update public.company_external_bookings set starts_at = p_starts where id = p_booking;
  perform public.company_audit(b.company_id, b.unit_id, 'booking.rescheduled', b.id::text, jsonb_build_object('from', b.starts_at, 'to', p_starts));
end;
$$;

create function public.cancel_external_booking(p_booking uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.company_external_bookings;
begin
  select * into b from public.company_external_bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  perform public.require_company_permission(b.unit_id, 'agenda.edit');
  if b.status <> 'confirmed' then raise exception 'Only a confirmed booking is cancelled' using errcode = '55000'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'A reason is required' using errcode = '22023'; end if;
  update public.company_external_bookings set status = 'cancelled', cancelled_at = now(), cancel_reason = trim(p_reason) where id = p_booking;
  perform public.company_audit(b.company_id, b.unit_id, 'booking.cancelled', b.id::text, jsonb_build_object('reason', trim(p_reason)));
end;
$$;

create function public.complete_external_booking(p_booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.company_external_bookings;
begin
  select * into b from public.company_external_bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  perform public.require_company_permission(b.unit_id, 'agenda.edit');
  if b.status <> 'confirmed' or b.starts_at > now() then raise exception 'Only a confirmed booking that has started is completed' using errcode = '55000'; end if;
  update public.company_external_bookings set status = 'done' where id = p_booking;
  perform public.company_audit(b.company_id, b.unit_id, 'booking.done', b.id::text);
end;
$$;

-- Tempo ocupado do instrutor, de QUALQUER origem, sem nenhum detalhe. Só para quem tem vínculo ativo com ele.
create function public.instructor_busy_intervals(p_instructor uuid, p_from timestamptz, p_to timestamptz) returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if p_to <= p_from or p_to - p_from > interval '31 days' then raise exception 'Invalid period' using errcode = '22023'; end if;
  if not exists (select 1 from public.company_instructor_links k join public.company_instructor_units iu on iu.link_id = k.id
      where k.instructor_id = p_instructor and k.status = 'active' and public.company_has_permission(iu.unit_id, 'agenda.view')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select m.starts_at, m.starts_at + make_interval(mins => m.minutes) from public.booking_meetings m join public.bookings b on b.id = m.booking_id
      where b.instructor_id = p_instructor and m.status <> 'cancelled' and (b.status = 'confirmed' or (b.status = 'awaiting_payment' and b.created_at >= now() - interval '10 minutes'))
        and tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.minutes), '[)') && tstzrange(p_from, p_to, '[)')
    union all
    select e.starts_at, e.starts_at + make_interval(mins => e.minutes) from public.company_external_bookings e
      where e.instructor_id = p_instructor and e.status = 'confirmed' and tstzrange(e.starts_at, e.starts_at + make_interval(mins => e.minutes), '[)') && tstzrange(p_from, p_to, '[)')
    union all
    select t.starts_at, t.ends_at from public.instructor_time_off t where t.instructor_id = p_instructor and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(p_from, p_to, '[)')
    order by 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fluxo digital: a agenda única. Mesma função de antes, com UM bloco a mais (reservas presenciais).
-- ---------------------------------------------------------------------------
create or replace function public.instructor_can_attend(p_id uuid, p_meetings jsonb)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; st timestamptz; en timestamptz; local_st timestamp; local_en timestamp;
  buff integer := 0; configured boolean;
begin
  select buffer_minutes into buff from public.instructor_schedule_settings where instructor_id = p_id;
  configured := found; buff := coalesce(buff, 0);
  if jsonb_typeof(p_meetings) <> 'array' then return false; end if;
  for v in select value from jsonb_array_elements(p_meetings) loop
    st := (v->>'starts_at')::timestamptz;
    en := st + make_interval(hours => (v->>'hours')::integer);
    local_st := st at time zone 'America/Fortaleza';
    local_en := en at time zone 'America/Fortaleza';
    if configured and not exists (select 1 from public.instructor_weekly_hours h
      where h.instructor_id = p_id and h.weekday = extract(dow from local_st)::integer
      and local_st::date = local_en::date and local_st::time >= h.opens_at
      and local_en::time <= h.closes_at) then return false; end if;
    if exists (select 1 from public.instructor_time_off t where t.instructor_id = p_id
      and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(st, en, '[)'))
    then return false; end if;
    if exists (select 1 from public.booking_meetings m join public.bookings b on b.id = m.booking_id
      where b.instructor_id = p_id and m.status <> 'cancelled'
      and (b.status = 'confirmed' or (b.status = 'awaiting_payment'
          and b.created_at >= now() - interval '10 minutes'))
      and tstzrange(m.starts_at - make_interval(mins => buff),
        m.starts_at + make_interval(mins => m.minutes + buff), '[)') && tstzrange(st, en, '[)'))
    then return false; end if;
    -- NOVO (Business fase 2): reserva presencial confirmada de qualquer empresa ocupa o horário.
    if exists (select 1 from public.company_external_bookings e
      where e.instructor_id = p_id and e.status = 'confirmed'
      and tstzrange(e.starts_at - make_interval(mins => buff),
        e.starts_at + make_interval(mins => e.minutes + buff), '[)') && tstzrange(st, en, '[)'))
    then return false; end if;
  end loop;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- RLS e concessões
-- ---------------------------------------------------------------------------
alter table public.company_services enable row level security;
alter table public.company_service_prices enable row level security;
alter table public.company_unit_services enable row level security;
alter table public.company_unit_service_instructors enable row level security;
alter table public.company_packages enable row level security;
alter table public.company_external_bookings enable row level security;

create policy company_services_select on public.company_services for select to authenticated using (public.company_any_permission(company_id, 'units.view') or public.is_admin());
create policy company_service_prices_select on public.company_service_prices for select to authenticated using (exists (select 1 from public.company_services s where s.id = service_id));
create policy company_unit_services_select on public.company_unit_services for select to authenticated using (public.company_has_permission(unit_id, 'units.view') or public.is_admin());
create policy company_unit_service_instructors_select on public.company_unit_service_instructors for select to authenticated using (public.company_has_permission(unit_id, 'units.view') or public.is_admin());
create policy company_packages_select on public.company_packages for select to authenticated using (public.company_any_permission(company_id, 'units.view') or public.is_admin());
create policy company_external_bookings_select on public.company_external_bookings for select to authenticated using (public.company_has_permission(unit_id, 'agenda.view') or public.is_admin());

revoke all on public.company_services, public.company_service_prices, public.company_unit_services, public.company_unit_service_instructors, public.company_packages, public.company_external_bookings from public, anon, authenticated;
grant select on public.company_services, public.company_service_prices, public.company_unit_services, public.company_unit_service_instructors, public.company_packages, public.company_external_bookings to authenticated;
revoke all on sequence public.company_service_prices_id_seq, public.company_booking_seq from public, anon, authenticated;

revoke all on function public.company_bookings_frozen(), public.company_service_price_cents(uuid, uuid, date), public.company_rate_bps(uuid, uuid, date),
  public.company_instructor_is_free(uuid, timestamptz, integer, uuid), public.company_check_slot(uuid, uuid, uuid, timestamptz, uuid),
  public.create_service(uuid, text, integer, integer, text, integer), public.set_service_price(uuid, uuid, integer),
  public.set_unit_service(uuid, uuid, text, smallint[], uuid[], boolean), public.create_package(uuid, text, integer, integer, integer), public.set_package_active(uuid, boolean),
  public.create_external_booking(uuid, uuid, uuid, text, text, timestamptz), public.reschedule_external_booking(uuid, timestamptz),
  public.cancel_external_booking(uuid, text), public.complete_external_booking(uuid), public.instructor_busy_intervals(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.create_service(uuid, text, integer, integer, text, integer), public.set_service_price(uuid, uuid, integer),
  public.set_unit_service(uuid, uuid, text, smallint[], uuid[], boolean), public.create_package(uuid, text, integer, integer, integer), public.set_package_active(uuid, boolean),
  public.create_external_booking(uuid, uuid, uuid, text, text, timestamptz), public.reschedule_external_booking(uuid, timestamptz),
  public.cancel_external_booking(uuid, text), public.complete_external_booking(uuid), public.instructor_busy_intervals(uuid, timestamptz, timestamptz) to authenticated;
-- Internas (sem EXECUTE para o cliente): company_bookings_frozen, company_service_price_cents, company_rate_bps, company_instructor_is_free, company_check_slot.
revoke execute on function public.company_bookings_frozen(), public.company_service_price_cents(uuid, uuid, date), public.company_rate_bps(uuid, uuid, date),
  public.company_instructor_is_free(uuid, timestamptz, integer, uuid), public.company_check_slot(uuid, uuid, uuid, timestamptz, uuid) from authenticated;

notify pgrst, 'reload schema';
commit;
