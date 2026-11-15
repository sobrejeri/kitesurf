-- PROPOSTA (rascunho para revisão). NÃO está em supabase/migrations e NÃO foi aplicada.
--
-- VentoKite Business, fase 1: empresas, unidades, equipe, convites, vínculo de
-- instrutores, comissão individual versionada e auditoria. Cobre as telas dos
-- blocos 1, 2 e 3 que hoje são demonstrativas. Estoque, caixa, lojinha,
-- afiliados e financeiro ficam para as fases seguintes (ver o documento).
--
-- Regras do projeto respeitadas:
--  * Toda escrita passa por função SECURITY DEFINER que confere papel e dono;
--    as tabelas não dão INSERT, UPDATE nem DELETE ao cliente.
--  * RLS em todas as tabelas; ler por id não é permissão.
--  * Nenhum fluxo cria administrador: o cargo de Proprietário não existe como
--    valor atribuível (enum company_role só tem manager, finance, attendant) e
--    o dono é companies.owner_id, definido só na criação da empresa.
--  * Ações administrativas geram auditoria append-only (trigger reject_change).
--  * Dinheiro e percentuais inteiros (basis points); datas no fuso de Fortaleza.
--  * Não usa service_role.
begin;

create type public.company_status as enum ('pending', 'active', 'suspended');
create type public.company_role as enum ('manager', 'finance', 'attendant');
create type public.company_link_status as enum ('invited', 'active', 'suspended', 'ended');
create type public.company_invitation_kind as enum ('staff', 'instructor');
create type public.company_invitation_status as enum ('pending', 'accepted', 'declined', 'expired');

-- ---------------------------------------------------------------------------
-- Catálogo de permissões (somente leitura para o cliente)
-- ---------------------------------------------------------------------------
create table public.company_permissions (
  id text primary key,
  sensitive boolean not null default false
);
create table public.company_role_permissions (
  role public.company_role not null,
  permission text not null references public.company_permissions (id),
  primary key (role, permission)
);
insert into public.company_permissions (id, sensitive) values
  ('units.view', false), ('units.edit', true), ('staff.view', false), ('staff.manage', true), ('perm.edit', true),
  ('instr.view', false), ('instr.manage', true), ('agenda.view', false), ('agenda.edit', false),
  ('cash.operate', false), ('cash.close', true), ('finance.reports', false);
insert into public.company_role_permissions (role, permission) values
  ('manager', 'units.view'), ('manager', 'units.edit'), ('manager', 'staff.view'), ('manager', 'instr.view'), ('manager', 'instr.manage'),
  ('manager', 'agenda.view'), ('manager', 'agenda.edit'), ('manager', 'cash.operate'), ('manager', 'finance.reports'),
  ('finance', 'units.view'), ('finance', 'staff.view'), ('finance', 'cash.operate'), ('finance', 'cash.close'), ('finance', 'finance.reports'),
  ('attendant', 'units.view'), ('attendant', 'instr.view'), ('attendant', 'agenda.view'), ('attendant', 'agenda.edit'), ('attendant', 'cash.operate');

-- ---------------------------------------------------------------------------
-- Empresas e unidades
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id),
  legal_name text not null check (char_length(legal_name) between 5 and 120),
  trade_name text not null check (char_length(trade_name) between 3 and 60),
  cnpj text not null unique check (public.tax_id_is_valid('cnpj', cnpj)),
  status public.company_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index companies_owner_idx on public.companies (owner_id);

create table public.company_units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name text not null check (char_length(name) between 3 and 80),
  city text not null check (char_length(city) between 2 and 80),
  address text not null check (char_length(address) between 5 and 120),
  lat numeric(9, 6) check (lat between -90 and 90),
  lng numeric(9, 6) check (lng between -180 and 180),
  opens time not null,
  closes time not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (opens < closes)
);
create index company_units_company_idx on public.company_units (company_id);

-- ---------------------------------------------------------------------------
-- Equipe: a mesma pessoa tem um cargo diferente em cada unidade
-- ---------------------------------------------------------------------------
create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  user_id uuid not null references public.profiles (id),
  status public.company_link_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);
create table public.company_member_units (
  member_id uuid not null references public.company_members (id),
  unit_id uuid not null references public.company_units (id),
  role public.company_role not null,
  primary key (member_id, unit_id)
);
-- Exceção por pessoa e unidade: granted = true concede, false retira.
create table public.company_member_overrides (
  member_id uuid not null references public.company_members (id),
  unit_id uuid not null references public.company_units (id),
  permission text not null references public.company_permissions (id),
  granted boolean not null,
  primary key (member_id, unit_id, permission)
);

-- ---------------------------------------------------------------------------
-- Convites (funcionário ou instrutor), respondidos pelo convidado
-- ---------------------------------------------------------------------------
create table public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  kind public.company_invitation_kind not null,
  email text not null check (email = lower(email) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'),
  commission_bps integer check (commission_bps between 1000 and 9000),
  status public.company_invitation_status not null default 'pending',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  check ((kind = 'instructor') = (commission_bps is not null))
);
create unique index company_invitations_one_pending on public.company_invitations (company_id, kind, email) where status = 'pending';
create table public.company_invitation_units (
  invitation_id uuid not null references public.company_invitations (id),
  unit_id uuid not null references public.company_units (id),
  role public.company_role,
  primary key (invitation_id, unit_id)
);

-- ---------------------------------------------------------------------------
-- Vínculo de instrutores. Suspender aqui NÃO altera instructors.status.
-- ---------------------------------------------------------------------------
create table public.company_instructor_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  instructor_id uuid not null references public.instructors (id),
  status public.company_link_status not null default 'active',
  independent_queue boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, instructor_id)
);
create table public.company_instructor_units (
  link_id uuid not null references public.company_instructor_links (id),
  unit_id uuid not null references public.company_units (id),
  primary key (link_id, unit_id)
);
-- Comissão individual: versões que nunca são editadas. unit_id nulo vale para todas as unidades.
create table public.company_instructor_rates (
  id bigserial primary key,
  link_id uuid not null references public.company_instructor_links (id),
  unit_id uuid references public.company_units (id),
  bps integer not null check (bps between 1000 and 9000),
  from_date date not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create unique index company_instructor_rates_one_per_day on public.company_instructor_rates (link_id, coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid), from_date);

-- ---------------------------------------------------------------------------
-- Auditoria da empresa (append-only)
-- ---------------------------------------------------------------------------
create table public.company_audit_logs (
  id bigserial primary key,
  company_id uuid not null references public.companies (id),
  unit_id uuid references public.company_units (id),
  actor_id uuid not null,
  action text not null,
  target text not null default '',
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index company_audit_company_idx on public.company_audit_logs (company_id, created_at desc);
create trigger company_audit_append_only before update or delete on public.company_audit_logs
  for each row execute function public.reject_change();
create trigger company_instructor_rates_append_only before update or delete on public.company_instructor_rates
  for each row execute function public.reject_change();

-- ---------------------------------------------------------------------------
-- Funções de apoio (SECURITY DEFINER, sem recursão nas políticas)
-- ---------------------------------------------------------------------------
create function public.auth_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(email) from auth.users where id = auth.uid();
$$;

create function public.company_has_permission(p_unit uuid, p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.company_units u
    join public.companies c on c.id = u.company_id
    where u.id = p_unit and c.status = 'active' and auth.uid() is not null and (
      c.owner_id = auth.uid()
      or exists (
        select 1
        from public.company_members m
        join public.company_member_units mu on mu.member_id = m.id and mu.unit_id = u.id
        where m.company_id = c.id and m.user_id = auth.uid() and m.status = 'active'
          and (
            (exists (select 1 from public.company_role_permissions rp where rp.role = mu.role and rp.permission = p_permission)
              and not exists (select 1 from public.company_member_overrides o where o.member_id = m.id and o.unit_id = u.id and o.permission = p_permission and not o.granted))
            or exists (select 1 from public.company_member_overrides o where o.member_id = m.id and o.unit_id = u.id and o.permission = p_permission and o.granted)
          )
      )
    )
  );
$$;

create function public.company_any_permission(p_company uuid, p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.company_units u where u.company_id = p_company and public.company_has_permission(u.id, p_permission))
    or exists (select 1 from public.companies c where c.id = p_company and c.status = 'active' and c.owner_id = auth.uid());
$$;

create function public.company_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.companies c where c.owner_id = auth.uid()
  union
  select m.company_id from public.company_members m where m.user_id = auth.uid() and m.status = 'active';
$$;

create function public.company_unit_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select u.id from public.company_units u join public.companies c on c.id = u.company_id where c.owner_id = auth.uid()
  union
  select mu.unit_id from public.company_member_units mu join public.company_members m on m.id = mu.member_id where m.user_id = auth.uid() and m.status = 'active';
$$;

create function public.require_company_permission(p_unit uuid, p_permission text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if not public.company_has_permission(p_unit, p_permission) then
    raise exception 'Not allowed: % in this unit', p_permission using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create function public.company_audit(p_company uuid, p_unit uuid, p_action text, p_target text, p_detail jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.company_audit_logs (company_id, unit_id, actor_id, action, target, detail)
  values (p_company, p_unit, auth.uid(), p_action, p_target, p_detail);
$$;

-- ---------------------------------------------------------------------------
-- Escritas (únicas portas de entrada)
-- ---------------------------------------------------------------------------
-- Qualquer conta que não seja administradora pode pedir o cadastro. A empresa nasce
-- pendente: nada opera até a administração do VentoKite aprovar.
create function public.create_company(p_legal_name text, p_trade_name text, p_cnpj text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r public.app_role; n text := upper(regexp_replace(coalesce(p_cnpj, ''), '[^0-9A-Za-z]', '', 'g')); cid uuid;
begin
  if uid is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  select role into r from public.profiles where id = uid;
  if r is null or r = 'admin' then raise exception 'Not allowed for this account' using errcode = '42501'; end if;
  if not public.tax_id_is_valid('cnpj', n) then raise exception 'Invalid CNPJ' using errcode = '22023'; end if;
  insert into public.companies (owner_id, legal_name, trade_name, cnpj) values (uid, trim(p_legal_name), trim(p_trade_name), n) returning id into cid;
  perform public.company_audit(cid, null, 'company.created', trim(p_trade_name));
  return cid;
end;
$$;

create function public.admin_set_company_status(p_company uuid, p_status public.company_status, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare old public.company_status;
begin
  perform public.require_role(array['admin']::public.app_role[]);
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'A reason is required' using errcode = '22023'; end if;
  select status into old from public.companies where id = p_company for update;
  if not found then raise exception 'Company not found' using errcode = 'P0002'; end if;
  update public.companies set status = p_status where id = p_company;
  perform public.company_audit(p_company, null, 'company.status', p_status::text, jsonb_build_object('from', old, 'reason', trim(p_reason)));
  perform public.write_audit('company.status', 'company', p_company::text, jsonb_build_object('status', old), jsonb_build_object('status', p_status), trim(p_reason));
end;
$$;

create function public.create_unit(p_company uuid, p_name text, p_city text, p_address text, p_lat numeric, p_lng numeric, p_opens time, p_closes time) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); uid2 uuid;
begin
  if not exists (select 1 from public.companies where id = p_company and owner_id = uid and status = 'active') then
    raise exception 'Only the owner of an active company creates units' using errcode = '42501';
  end if;
  insert into public.company_units (company_id, name, city, address, lat, lng, opens, closes) values (p_company, trim(p_name), trim(p_city), trim(p_address), p_lat, p_lng, p_opens, p_closes) returning id into uid2;
  perform public.company_audit(p_company, uid2, 'unit.created', trim(p_name));
  return uid2;
end;
$$;

create function public.update_unit(p_unit uuid, p_name text, p_city text, p_address text, p_opens time, p_closes time, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare u public.company_units; is_owner boolean;
begin
  perform public.require_company_permission(p_unit, 'units.edit');
  select * into u from public.company_units where id = p_unit for update;
  select owner_id = auth.uid() into is_owner from public.companies where id = u.company_id;
  if u.active <> p_active and not is_owner then raise exception 'Only the owner activates or deactivates a unit' using errcode = '42501'; end if;
  update public.company_units set name = trim(p_name), city = trim(p_city), address = trim(p_address), opens = p_opens, closes = p_closes, active = p_active where id = p_unit;
  perform public.company_audit(u.company_id, p_unit, 'unit.updated', trim(p_name), jsonb_build_object('was', jsonb_build_object('name', u.name, 'opens', u.opens, 'closes', u.closes, 'active', u.active)));
end;
$$;

-- grants: [{"unit_id": "...", "role": "manager|finance|attendant"}]. "owner" nunca é aceito.
create function public.invite_staff(p_company uuid, p_email text, p_grants jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare e text := lower(trim(coalesce(p_email, ''))); g jsonb; iid uuid; uid uuid := auth.uid();
begin
  if jsonb_typeof(p_grants) <> 'array' or jsonb_array_length(p_grants) = 0 then raise exception 'At least one unit and role' using errcode = '22023'; end if;
  for g in select * from jsonb_array_elements(p_grants) loop
    if (g ->> 'role') not in ('manager', 'finance', 'attendant') then raise exception 'Owner or unknown role cannot be granted by invitation' using errcode = '22023'; end if;
    if not exists (select 1 from public.company_units where id = (g ->> 'unit_id')::uuid and company_id = p_company and active) then raise exception 'Unit not in this company' using errcode = '22023'; end if;
    perform public.require_company_permission((g ->> 'unit_id')::uuid, 'staff.manage');
  end loop;
  if exists (select 1 from public.company_members m join public.profiles p on p.id = m.user_id join auth.users a on a.id = p.id where m.company_id = p_company and lower(a.email) = e and m.status = 'active') then
    raise exception 'Already a member' using errcode = '23505';
  end if;
  insert into public.company_invitations (company_id, kind, email, created_by) values (p_company, 'staff', e, uid) returning id into iid;
  for g in select * from jsonb_array_elements(p_grants) loop
    insert into public.company_invitation_units (invitation_id, unit_id, role) values (iid, (g ->> 'unit_id')::uuid, (g ->> 'role')::public.company_role);
  end loop;
  perform public.company_audit(p_company, null, 'staff.invited', e);
  return iid;
end;
$$;

create function public.invite_instructor(p_company uuid, p_email text, p_units uuid[], p_commission_bps integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare e text := lower(trim(coalesce(p_email, ''))); u uuid; iid uuid;
begin
  if coalesce(array_length(p_units, 1), 0) = 0 then raise exception 'At least one unit' using errcode = '22023'; end if;
  foreach u in array p_units loop
    if not exists (select 1 from public.company_units where id = u and company_id = p_company and active) then raise exception 'Unit not in this company' using errcode = '22023'; end if;
    perform public.require_company_permission(u, 'instr.manage');
  end loop;
  insert into public.company_invitations (company_id, kind, email, commission_bps, created_by) values (p_company, 'instructor', e, p_commission_bps, auth.uid()) returning id into iid;
  foreach u in array p_units loop insert into public.company_invitation_units (invitation_id, unit_id) values (iid, u); end loop;
  perform public.company_audit(p_company, null, 'instructor.invited', e, jsonb_build_object('commission_bps', p_commission_bps));
  return iid;
end;
$$;

create function public.accept_company_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); inv public.company_invitations; r public.app_role; mid uuid; lid uuid; unit_row record;
begin
  if uid is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  select * into inv from public.company_invitations where id = p_id for update;
  if not found or inv.status <> 'pending' or inv.email <> public.auth_email() then raise exception 'Invitation not available' using errcode = '42501'; end if;
  if inv.expires_at < now() then update public.company_invitations set status = 'expired' where id = p_id; return; end if;
  select role into r from public.profiles where id = uid;
  if r = 'admin' then raise exception 'Not allowed for this account' using errcode = '42501'; end if;
  if inv.kind = 'staff' then
    insert into public.company_members (company_id, user_id) values (inv.company_id, uid)
      on conflict (company_id, user_id) do update set status = 'active' returning id into mid;
    for unit_row in select unit_id, role from public.company_invitation_units where invitation_id = p_id loop
      insert into public.company_member_units (member_id, unit_id, role) values (mid, unit_row.unit_id, unit_row.role)
        on conflict (member_id, unit_id) do update set role = excluded.role;
    end loop;
  else
    if r <> 'instructor' or not exists (select 1 from public.instructors where id = uid and status = 'approved') then raise exception 'Only an approved instructor accepts' using errcode = '42501'; end if;
    insert into public.company_instructor_links (company_id, instructor_id) values (inv.company_id, uid)
      on conflict (company_id, instructor_id) do update set status = 'active' returning id into lid;
    for unit_row in select unit_id from public.company_invitation_units where invitation_id = p_id loop
      insert into public.company_instructor_units (link_id, unit_id) values (lid, unit_row.unit_id) on conflict do nothing;
    end loop;
    insert into public.company_instructor_rates (link_id, unit_id, bps, from_date, created_by)
      values (lid, null, inv.commission_bps, (now() at time zone 'America/Fortaleza')::date, uid) on conflict do nothing;
  end if;
  update public.company_invitations set status = 'accepted' where id = p_id;
  perform public.company_audit(inv.company_id, null, inv.kind::text || '.accepted', inv.email);
end;
$$;

create function public.decline_company_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare inv public.company_invitations;
begin
  select * into inv from public.company_invitations where id = p_id for update;
  if not found or inv.status <> 'pending' or inv.email <> public.auth_email() then raise exception 'Invitation not available' using errcode = '42501'; end if;
  update public.company_invitations set status = 'declined' where id = p_id;
  perform public.company_audit(inv.company_id, null, inv.kind::text || '.declined', inv.email);
end;
$$;

-- p_role nulo remove o vínculo da pessoa com a unidade.
create function public.set_member_unit_role(p_member uuid, p_unit uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.company_members;
begin
  perform public.require_company_permission(p_unit, 'perm.edit');
  select * into m from public.company_members where id = p_member for update;
  if not found or not exists (select 1 from public.company_units where id = p_unit and company_id = m.company_id) then raise exception 'Member or unit not found' using errcode = 'P0002'; end if;
  if p_role is null then
    delete from public.company_member_overrides where member_id = p_member and unit_id = p_unit;
    delete from public.company_member_units where member_id = p_member and unit_id = p_unit;
  else
    if p_role not in ('manager', 'finance', 'attendant') then raise exception 'Owner or unknown role cannot be granted' using errcode = '22023'; end if;
    insert into public.company_member_units (member_id, unit_id, role) values (p_member, p_unit, p_role::public.company_role)
      on conflict (member_id, unit_id) do update set role = excluded.role;
  end if;
  perform public.company_audit(m.company_id, p_unit, 'member.role', p_member::text, jsonb_build_object('role', p_role));
end;
$$;

-- p_granted nulo remove a exceção. Conceder permissão sensível exige o Proprietário.
create function public.set_member_override(p_member uuid, p_unit uuid, p_permission text, p_granted boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.company_members; sens boolean;
begin
  perform public.require_company_permission(p_unit, 'perm.edit');
  select * into m from public.company_members where id = p_member for update;
  select sensitive into sens from public.company_permissions where id = p_permission;
  if not found or m.id is null or not exists (select 1 from public.company_member_units where member_id = p_member and unit_id = p_unit) then raise exception 'Member, unit or permission not found' using errcode = 'P0002'; end if;
  if p_granted is true and sens and not exists (select 1 from public.companies where id = m.company_id and owner_id = auth.uid()) then
    raise exception 'Only the owner grants sensitive permissions' using errcode = '42501';
  end if;
  if p_granted is null then delete from public.company_member_overrides where member_id = p_member and unit_id = p_unit and permission = p_permission;
  else insert into public.company_member_overrides (member_id, unit_id, permission, granted) values (p_member, p_unit, p_permission, p_granted)
    on conflict (member_id, unit_id, permission) do update set granted = excluded.granted; end if;
  perform public.company_audit(m.company_id, p_unit, 'member.override', p_member::text, jsonb_build_object('permission', p_permission, 'granted', p_granted));
end;
$$;

-- Suspender é só deste vínculo: instructors.status e as outras escolas não mudam.
create function public.set_instructor_link_status(p_link uuid, p_status public.company_link_status, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.company_instructor_links;
begin
  select * into l from public.company_instructor_links where id = p_link for update;
  if not found then raise exception 'Link not found' using errcode = 'P0002'; end if;
  if p_status not in ('active', 'suspended', 'ended') then raise exception 'Invalid status' using errcode = '22023'; end if;
  if not exists (select 1 from public.company_instructor_units iu where iu.link_id = p_link and public.company_has_permission(iu.unit_id, 'instr.manage'))
     and not exists (select 1 from public.companies where id = l.company_id and owner_id = auth.uid() and status = 'active') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'A reason is required' using errcode = '22023'; end if;
  update public.company_instructor_links set status = p_status where id = p_link;
  perform public.company_audit(l.company_id, null, 'instructor.link', p_link::text, jsonb_build_object('status', p_status, 'reason', trim(p_reason)));
end;
$$;

-- Nova versão a partir de hoje (Fortaleza). Nunca reescreve versões nem aulas já dadas.
create function public.set_instructor_rate(p_link uuid, p_unit uuid, p_bps integer) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.company_instructor_links; ok boolean;
begin
  select * into l from public.company_instructor_links where id = p_link;
  if not found then raise exception 'Link not found' using errcode = 'P0002'; end if;
  select exists (select 1 from public.company_instructor_units iu where iu.link_id = p_link and public.company_has_permission(iu.unit_id, 'instr.manage'))
    or exists (select 1 from public.companies where id = l.company_id and owner_id = auth.uid() and status = 'active') into ok;
  if not ok then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_unit is not null and not exists (select 1 from public.company_instructor_units where link_id = p_link and unit_id = p_unit) then raise exception 'Unit not in this link' using errcode = '22023'; end if;
  if p_bps is null or p_bps < 1000 or p_bps > 9000 then raise exception 'Commission from 10%% to 90%%' using errcode = '22023'; end if;
  insert into public.company_instructor_rates (link_id, unit_id, bps, from_date, created_by) values (p_link, p_unit, p_bps, (now() at time zone 'America/Fortaleza')::date, auth.uid());
  perform public.company_audit(l.company_id, p_unit, 'instructor.rate', p_link::text, jsonb_build_object('bps', p_bps));
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS e concessões: o cliente só lê; nada de INSERT/UPDATE/DELETE direto.
-- ---------------------------------------------------------------------------
alter table public.company_permissions enable row level security;
alter table public.company_role_permissions enable row level security;
alter table public.companies enable row level security;
alter table public.company_units enable row level security;
alter table public.company_members enable row level security;
alter table public.company_member_units enable row level security;
alter table public.company_member_overrides enable row level security;
alter table public.company_invitations enable row level security;
alter table public.company_invitation_units enable row level security;
alter table public.company_instructor_links enable row level security;
alter table public.company_instructor_units enable row level security;
alter table public.company_instructor_rates enable row level security;
alter table public.company_audit_logs enable row level security;

create policy company_permissions_select on public.company_permissions for select to authenticated using (true);
create policy company_role_permissions_select on public.company_role_permissions for select to authenticated using (true);
create policy companies_select on public.companies for select to authenticated using (owner_id = auth.uid() or id in (select public.company_ids()) or public.is_admin());
create policy company_units_select on public.company_units for select to authenticated using (id in (select public.company_unit_ids()) or public.is_admin());
create policy company_members_select on public.company_members for select to authenticated using (user_id = auth.uid() or public.company_any_permission(company_id, 'staff.view') or public.is_admin());
create policy company_member_units_select on public.company_member_units for select to authenticated using (exists (select 1 from public.company_members m where m.id = member_id));
create policy company_member_overrides_select on public.company_member_overrides for select to authenticated using (exists (select 1 from public.company_members m where m.id = member_id));
create policy company_invitations_select on public.company_invitations for select to authenticated using (
  email = public.auth_email() or public.company_any_permission(company_id, case when kind = 'staff' then 'staff.manage' else 'instr.manage' end) or public.is_admin());
create policy company_invitation_units_select on public.company_invitation_units for select to authenticated using (exists (select 1 from public.company_invitations i where i.id = invitation_id));
create policy company_instructor_links_select on public.company_instructor_links for select to authenticated using (instructor_id = auth.uid() or public.company_any_permission(company_id, 'instr.view') or public.is_admin());
create policy company_instructor_units_select on public.company_instructor_units for select to authenticated using (exists (select 1 from public.company_instructor_links l where l.id = link_id));
create policy company_instructor_rates_select on public.company_instructor_rates for select to authenticated using (exists (select 1 from public.company_instructor_links l where l.id = link_id));
create policy company_audit_logs_select on public.company_audit_logs for select to authenticated using (public.company_any_permission(company_id, 'perm.edit') or public.is_admin());

revoke all on public.company_permissions, public.company_role_permissions, public.companies, public.company_units, public.company_members, public.company_member_units,
  public.company_member_overrides, public.company_invitations, public.company_invitation_units, public.company_instructor_links, public.company_instructor_units,
  public.company_instructor_rates, public.company_audit_logs from public, anon, authenticated;
grant select on public.company_permissions, public.company_role_permissions, public.companies, public.company_units, public.company_members, public.company_member_units,
  public.company_member_overrides, public.company_invitations, public.company_invitation_units, public.company_instructor_links, public.company_instructor_units,
  public.company_instructor_rates, public.company_audit_logs to authenticated;
revoke all on sequence public.company_audit_logs_id_seq, public.company_instructor_rates_id_seq from public, anon, authenticated;

revoke all on function public.auth_email(), public.company_has_permission(uuid, text), public.company_any_permission(uuid, text), public.company_ids(), public.company_unit_ids(),
  public.require_company_permission(uuid, text), public.company_audit(uuid, uuid, text, text, jsonb),
  public.create_company(text, text, text), public.admin_set_company_status(uuid, public.company_status, text),
  public.create_unit(uuid, text, text, text, numeric, numeric, time, time), public.update_unit(uuid, text, text, text, time, time, boolean),
  public.invite_staff(uuid, text, jsonb), public.invite_instructor(uuid, text, uuid[], integer), public.accept_company_invitation(uuid), public.decline_company_invitation(uuid),
  public.set_member_unit_role(uuid, uuid, text), public.set_member_override(uuid, uuid, text, boolean),
  public.set_instructor_link_status(uuid, public.company_link_status, text), public.set_instructor_rate(uuid, uuid, integer) from public, anon;
grant execute on function public.auth_email(), public.company_has_permission(uuid, text), public.company_any_permission(uuid, text), public.company_ids(), public.company_unit_ids(),
  public.create_company(text, text, text), public.admin_set_company_status(uuid, public.company_status, text),
  public.create_unit(uuid, text, text, text, numeric, numeric, time, time), public.update_unit(uuid, text, text, text, time, time, boolean),
  public.invite_staff(uuid, text, jsonb), public.invite_instructor(uuid, text, uuid[], integer), public.accept_company_invitation(uuid), public.decline_company_invitation(uuid),
  public.set_member_unit_role(uuid, uuid, text), public.set_member_override(uuid, uuid, text, boolean),
  public.set_instructor_link_status(uuid, public.company_link_status, text), public.set_instructor_rate(uuid, uuid, integer) to authenticated;
-- company_audit e require_company_permission são internas: sem EXECUTE para o cliente.

notify pgrst, 'reload schema';
commit;
