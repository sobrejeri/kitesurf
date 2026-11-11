-- Vento | 47: CPF or CNPJ for instructors and affiliates.
--
-- Sign-in stays e-mail and password for everyone. The tax id is registration
-- data: private (only the holder and the administration read it), checked by
-- its check digits (including the alphanumeric CNPJ), unique within each kind
-- of account and required for the first approval. Once approved, only the
-- administration changes it, with a reason in the audit log. The audit log
-- never stores the number itself.
--
-- Independent of migrations 43–46. Does not change bookings, amounts, roles
-- or existing approvals: instructors and affiliates approved before this
-- migration stay approved and may add their document once.
begin;

-- Check digits, modulo 11. Each CNPJ character counts as its ASCII code minus
-- 48, so 0-9 keep their value and A-Z become 17-42 (Receita Federal, IN RFB
-- 2.229/2024); the two check digits stay numeric. A CPF is digits only.
create function public.tax_id_is_valid(p_kind text, p_number text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  weights integer[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  total integer;
  remainder integer;
  first_check integer;
  second_check integer;
begin
  if p_kind = 'cpf' then
    if p_number is null or p_number !~ '^[0-9]{11}$'
      or p_number = repeat(substr(p_number, 1, 1), 11) then
      return false;
    end if;
    total := 0;
    for i in 1..9 loop
      total := total + substr(p_number, i, 1)::integer * (11 - i);
    end loop;
    first_check := (total * 10) % 11 % 10;
    total := 0;
    for i in 1..10 loop
      total := total + substr(p_number, i, 1)::integer * (12 - i);
    end loop;
    second_check := (total * 10) % 11 % 10;
    return first_check = substr(p_number, 10, 1)::integer
      and second_check = substr(p_number, 11, 1)::integer;
  elsif p_kind = 'cnpj' then
    if p_number is null or p_number !~ '^[0-9A-Z]{12}[0-9]{2}$'
      or p_number = repeat(substr(p_number, 1, 1), 14) then
      return false;
    end if;
    total := 0;
    for i in 1..12 loop
      total := total + (ascii(substr(p_number, i, 1)) - 48) * weights[i + 1];
    end loop;
    remainder := total % 11;
    first_check := case when remainder < 2 then 0 else 11 - remainder end;
    total := 0;
    for i in 1..13 loop
      total := total + (ascii(substr(p_number, i, 1)) - 48) * weights[i];
    end loop;
    remainder := total % 11;
    second_check := case when remainder < 2 then 0 else 11 - remainder end;
    return first_check = substr(p_number, 13, 1)::integer
      and second_check = substr(p_number, 14, 1)::integer;
  end if;
  return false;
end $$;

-- Typed with or without punctuation; kept as digits (and CNPJ letters) only.
create function public.normalize_tax_id(p_number text)
returns text language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p_number, ''), '[^0-9A-Za-z]', '', 'g'));
$$;

create function public.tax_id_kind(p_number text)
returns text language sql immutable set search_path = '' as $$
  select case length(p_number) when 11 then 'cpf' when 14 then 'cnpj' end;
$$;

create table public.account_tax_ids (
  id uuid primary key references public.profiles (id) on delete cascade,
  -- The kind of account the number belongs to: one CPF or CNPJ per
  -- instructor account and one per affiliate account.
  account_role public.app_role not null check (account_role in ('instructor', 'partner')),
  kind text not null check (kind in ('cpf', 'cnpj')),
  number text not null,
  updated_at timestamptz not null default now(),
  constraint account_tax_ids_number_valid check (public.tax_id_is_valid(kind, number)),
  constraint account_tax_ids_one_per_role unique (account_role, number)
);

alter table public.account_tax_ids enable row level security;
revoke all on public.account_tax_ids from public, anon, authenticated;
grant select on public.account_tax_ids to authenticated;
-- No INSERT, UPDATE or DELETE for clients: writes go through the functions below.
create policy account_tax_ids_read on public.account_tax_ids
  for select to authenticated using (id = (select auth.uid()) or public.is_admin());

-- The holder fills in their own CPF or CNPJ while in review. After approval
-- the team has checked it against the identity document, so it is locked;
-- an account approved before this migration may still add it once.
create function public.set_my_tax_id(p_number text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_role(array['instructor', 'partner']::public.app_role[]);
  my_role public.app_role;
  clean text := public.normalize_tax_id(p_number);
  chosen text := public.tax_id_kind(public.normalize_tax_id(p_number));
  previous public.account_tax_ids;
begin
  select role into my_role from public.profiles where id = uid;
  if my_role is null or my_role not in ('instructor', 'partner') then
    raise exception 'Only instructors and affiliates register a CPF or CNPJ'
      using errcode = '42501';
  end if;
  if chosen is null or not public.tax_id_is_valid(chosen, clean) then
    raise exception 'Invalid CPF or CNPJ' using errcode = '22023';
  end if;
  select * into previous from public.account_tax_ids where id = uid for update;
  if previous.id is not null and (
    (my_role = 'instructor' and exists (
      select 1 from public.instructors where id = uid and approved_at is not null))
    or (my_role = 'partner' and exists (
      select 1 from public.partners where owner_id = uid and status = 'approved'))
  ) then
    raise exception 'Approved CPF or CNPJ changes require admin review'
      using errcode = '55000';
  end if;
  insert into public.account_tax_ids (id, account_role, kind, number)
  values (uid, my_role, chosen, clean)
  on conflict (id) do update
    set account_role = excluded.account_role, kind = excluded.kind,
        number = excluded.number, updated_at = now();
  perform public.write_audit('account.tax_id_saved', 'profile', uid::text,
    case when previous.id is null then null else jsonb_build_object('kind', previous.kind) end,
    jsonb_build_object('kind', chosen), 'CPF ou CNPJ informado pelo titular');
end $$;

-- Correction by the administration (e.g. a typo found after approval).
create function public.admin_set_tax_id(p_profile_id uuid, p_number text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_role public.app_role;
  clean text := public.normalize_tax_id(p_number);
  chosen text := public.tax_id_kind(public.normalize_tax_id(p_number));
  previous public.account_tax_ids;
begin
  perform public.require_role(array['admin']::public.app_role[]);
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  select role into target_role from public.profiles where id = p_profile_id;
  if target_role is null or target_role not in ('instructor', 'partner') then
    raise exception 'Instructor or affiliate account not found' using errcode = 'P0002';
  end if;
  if chosen is null or not public.tax_id_is_valid(chosen, clean) then
    raise exception 'Invalid CPF or CNPJ' using errcode = '22023';
  end if;
  select * into previous from public.account_tax_ids where id = p_profile_id for update;
  insert into public.account_tax_ids (id, account_role, kind, number)
  values (p_profile_id, target_role, chosen, clean)
  on conflict (id) do update
    set account_role = excluded.account_role, kind = excluded.kind,
        number = excluded.number, updated_at = now();
  perform public.write_audit('account.tax_id_corrected', 'profile', p_profile_id::text,
    case when previous.id is null then null else jsonb_build_object('kind', previous.kind) end,
    jsonb_build_object('kind', chosen), btrim(p_reason));
end $$;

-- First approval of an instructor also requires the CPF or CNPJ (migration 18
-- plus the tax id check).
create or replace function public.set_instructor_status(p_instructor_id uuid, p_status public.instructor_status, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  i public.instructors;
begin
  perform public.require_role(array['admin']::public.app_role[]);
  select * into i from public.instructors where id = p_instructor_id for update;
  if i.id is null then
    raise exception 'Instructor not found' using errcode = 'P0002';
  end if;

  -- First-time activation requires administrator-reviewed identity and
  -- professional qualification. Resume an already-approved teacher normally.
  if p_status = 'approved' and i.approved_at is null then
    if not exists(select 1 from public.instructor_documents d
      where d.instructor_id=i.id and d.kind='identity' and d.status='approved')
      or not exists(select 1 from public.instructor_documents d
      where d.instructor_id=i.id and d.kind='certification' and d.status='approved')
    then raise exception 'Instructor documents must be approved before activation'
      using errcode='55000'; end if;
    if not exists(select 1 from public.account_tax_ids t
      where t.id=i.id and t.account_role='instructor')
    then raise exception 'Instructor CPF or CNPJ is required before activation'
      using errcode='55000'; end if;
  end if;
  update public.instructors set
    status = p_status,
    approved_at = coalesce(approved_at, case when p_status = 'approved' then now() end),
    -- First approval takes a place at the end; pausing and resuming keep it.
    queue_position = coalesce(queue_position,
      case when p_status = 'approved' then nextval('public.instructor_queue_seq') end)
  where id = i.id;

  perform public.write_audit('instructor.status_changed', 'instructor', i.id::text,
    jsonb_build_object('status', i.status), jsonb_build_object('status', p_status), p_reason);
end;
$$;

-- Approval of an affiliate also requires the CPF or CNPJ (migration 22 plus
-- the tax id check).
create or replace function public.set_partner_status(
  p_partner_id uuid,p_status public.partner_status,p_reason text
) returns void language plpgsql security definer set search_path='' as $$
declare
  p public.partners;
  profile public.partner_private_profiles;
begin
  perform public.require_role(array['admin']::public.app_role[]);
  if p_reason is null or length(btrim(p_reason))<3 then
    raise exception 'A reason is required' using errcode='22023'; end if;
  select * into p from public.partners where id=p_partner_id for update;
  if p.id is null then raise exception 'Partner not found' using errcode='P0002'; end if;
  if p_status='approved' and p.status<>'approved' then
    select * into profile from public.partner_private_profiles where id=p.owner_id;
    if profile.id is null or length(btrim(profile.responsible_name))<2
      or length(btrim(profile.phone))<8
      or length(btrim(profile.city))<2
      or length(btrim(profile.address))<5 then
      raise exception 'Partner profile must be completed before approval'
        using errcode='55000';
    end if;
    if not exists(select 1 from public.account_tax_ids t
      where t.id=p.owner_id and t.account_role='partner') then
      raise exception 'Partner CPF or CNPJ is required before approval'
        using errcode='55000';
    end if;
  end if;
  update public.partners set status=p_status where id=p.id;
  perform public.write_audit('partner.status_changed','partner',p.id::text,
    jsonb_build_object('status',p.status),
    jsonb_build_object('status',p_status),p_reason);
end $$;

-- Completeness flags gain "taxId" (presence only, never the number).
create or replace function public.get_partner_profile_progress(p_partner_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  uid uuid:=auth.uid();
  v_partner public.partners;
  result jsonb;
begin
  select * into v_partner from public.partners where id=p_partner_id;
  if v_partner.id is null then
    raise exception 'Partner not found' using errcode='P0002'; end if;
  if uid is null or (v_partner.owner_id<>uid and not public.is_admin()) then
    raise exception 'Not allowed to inspect this partner' using errcode='42501'; end if;
  select jsonb_build_object(
    'name',length(btrim(coalesce(partner_row.name,'')))>=2,
    'beach',partner_row.beach_id is not null,
    'responsible',length(btrim(coalesce(d.responsible_name,'')))>=2,
    'phone',length(btrim(coalesce(d.phone,'')))>=8,
    'city',length(btrim(coalesce(d.city,'')))>=2,
    'address',length(btrim(coalesce(d.address,'')))>=5,
    'instagram',length(btrim(coalesce(d.instagram,'')))>0,
    'avatar',length(btrim(coalesce(d.avatar_path,'')))>0,
    'payout',exists(select 1 from public.partner_payout_details pd where pd.id=v_partner.owner_id),
    'taxId',exists(select 1 from public.account_tax_ids t
      where t.id=v_partner.owner_id and t.account_role='partner')
  ) into result
  from public.partners partner_row
  left join public.partner_private_profiles d on d.id=partner_row.owner_id
  where partner_row.id=p_partner_id;
  return result;
end $$;

create or replace function public.get_instructor_profile_progress(p_instructor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null or p_instructor_id is null
    or (uid <> p_instructor_id and not public.is_admin()) then
    raise exception 'Profile progress unavailable'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.instructors i where i.id = p_instructor_id) then
    raise exception 'Instructor not found'
      using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'fullName', length(btrim(coalesce(p.full_name, ''))) >= 2,
    'photo', length(btrim(coalesce(ip.avatar_path, ''))) > 0,
    'phone', length(btrim(coalesce(ip.phone, ''))) > 0,
    'city', length(btrim(coalesce(ip.city, ''))) > 0,
    'bio', length(btrim(coalesce(ip.bio, ''))) > 0,
    'beaches', exists (
      select 1 from public.instructor_beaches ib where ib.instructor_id = i.id
    ),
    'languages', coalesce(cardinality(i.languages), 0) > 0,
    -- Zero years is a valid declaration by a new instructor.
    'experience', i.years_experience is not null,
    -- "No equipment" and "No vehicle" are valid optional answers.
    'equipment', coalesce(i.has_equipment, false),
    'supportVehicle', coalesce(i.has_support_vehicle, false),
    'payout', exists (
      select 1 from public.instructor_payout_details pd where pd.id = i.id
    ),
    'taxId', exists (
      select 1 from public.account_tax_ids t
      where t.id = i.id and t.account_role = 'instructor'
    )
  ) into result
  from public.instructors i
  join public.profiles p on p.id = i.id
  left join public.instructor_private_profiles ip on ip.id = i.id
  where i.id = p_instructor_id;

  return result;
end $$;

revoke all on function public.tax_id_is_valid(text, text) from public, anon;
revoke all on function public.normalize_tax_id(text) from public, anon;
revoke all on function public.tax_id_kind(text) from public, anon;
revoke all on function public.set_my_tax_id(text) from public, anon;
revoke all on function public.admin_set_tax_id(uuid, text, text) from public, anon;
grant execute on function public.tax_id_is_valid(text, text) to authenticated;
grant execute on function public.normalize_tax_id(text) to authenticated;
grant execute on function public.tax_id_kind(text) to authenticated;
grant execute on function public.set_my_tax_id(text) to authenticated;
grant execute on function public.admin_set_tax_id(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
