-- Vento: partner/pousada profile, private contact, avatar and payout metadata.
-- No automatic transfers, no changes to referral codes or commission amounts.
-- Install after migration 21. Execute once after a production backup.
begin;

create table public.partner_private_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  responsible_name text not null default '' check(char_length(responsible_name)<=120),
  phone text not null default '' check(char_length(phone)<=20),
  city text not null default '' check(char_length(city)<=80),
  address text not null default '' check(char_length(address)<=200),
  instagram text not null default '' check(char_length(instagram)<=80),
  avatar_path text check(
    avatar_path is null or (
      char_length(avatar_path)<=200 and
      avatar_path ~ '^[a-f0-9-]{36}/avatar\.(jpg|png|webp)$'
    )
  ),
  updated_at timestamptz not null default now()
);

create table public.partner_payout_details (
  id uuid primary key references public.profiles(id) on delete cascade,
  method text not null check(method in ('pix','bank')),
  holder_name text not null check(char_length(holder_name) between 2 and 120),
  pix_key text check(pix_key is null or char_length(pix_key)<=140),
  bank_name text check(bank_name is null or char_length(bank_name)<=100),
  branch text check(branch is null or char_length(branch)<=30),
  account_number text check(account_number is null or char_length(account_number)<=40),
  account_type text check(account_type is null or account_type in ('checking','savings')),
  updated_at timestamptz not null default now(),
  constraint partner_payout_fields check(
    (method='pix' and pix_key is not null and char_length(pix_key)>=5
      and bank_name is null and branch is null and account_number is null and account_type is null)
    or
    (method='bank' and bank_name is not null and branch is not null
      and account_number is not null and account_type is not null and pix_key is null)
  )
);

alter table public.partner_private_profiles enable row level security;
alter table public.partner_payout_details enable row level security;
revoke all on public.partner_private_profiles,public.partner_payout_details from anon,authenticated;
grant select on public.partner_private_profiles,public.partner_payout_details to authenticated;
grant insert (id,method,holder_name,pix_key,bank_name,branch,account_number,account_type,updated_at)
  on public.partner_payout_details to authenticated;
grant update (method,holder_name,pix_key,bank_name,branch,account_number,account_type,updated_at)
  on public.partner_payout_details to authenticated;

create policy partner_private_owner_select on public.partner_private_profiles
  for select to authenticated using(id=(select auth.uid()));
create policy partner_payout_owner_select on public.partner_payout_details
  for select to authenticated using(id=(select auth.uid()));
create policy partner_payout_owner_insert on public.partner_payout_details
  for insert to authenticated with check(id=(select auth.uid())
    and exists(select 1 from public.partners p where p.owner_id=id));
create policy partner_payout_owner_update on public.partner_payout_details
  for update to authenticated using(id=(select auth.uid()))
  with check(id=(select auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('vento-partner-avatars','vento-partner-avatars',false,3145728,
  array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;

create policy vento_partner_avatar_select on storage.objects
  for select to authenticated using(
    bucket_id='vento-partner-avatars'
    and ((storage.foldername(name))[1]=(select auth.uid())::text or public.is_admin())
  );
create policy vento_partner_avatar_insert on storage.objects
  for insert to authenticated with check(
    bucket_id='vento-partner-avatars'
    and (storage.foldername(name))[1]=(select auth.uid())::text
  );
create policy vento_partner_avatar_update on storage.objects
  for update to authenticated using(
    bucket_id='vento-partner-avatars'
    and (storage.foldername(name))[1]=(select auth.uid())::text
  ) with check(
    bucket_id='vento-partner-avatars'
    and (storage.foldername(name))[1]=(select auth.uid())::text
  );

-- The establishment name and beach can be changed while pending.
-- Approved partners may update contact details, but changes to their
-- verified business identity require administrative review.
create function public.update_my_partner_profile(
  p_name text,p_beach_id uuid,p_responsible_name text,
  p_phone text,p_city text,p_address text,p_instagram text
) returns void language plpgsql security definer set search_path='' as $$
declare
  uid uuid:=public.require_role(array['partner']::public.app_role[]);
  p public.partners;
begin
  select * into p from public.partners where owner_id=uid for update;
  if p.id is null then
    raise exception 'Partner account not found' using errcode='P0002'; end if;
  if p_name is null or length(btrim(p_name)) not between 2 and 120
    or p_responsible_name is null or length(btrim(p_responsible_name))>120
    or p_phone is null or length(btrim(p_phone))>20
    or p_city is null or length(btrim(p_city))>80
    or p_address is null or length(btrim(p_address))>200
    or p_instagram is null or length(btrim(p_instagram))>80
    or p_phone !~ '^[+0-9 ()\.\-]*$'
  then raise exception 'Invalid partner profile fields' using errcode='22023'; end if;
  if (p.name is distinct from btrim(p_name) or p.beach_id is distinct from p_beach_id)
      and p.status='approved' then
    raise exception 'Approved establishment identity requires admin review'
      using errcode='55000';
  end if;
  if p.beach_id is distinct from p_beach_id and not exists(
    select 1 from public.beaches where id=p_beach_id and active
  ) then raise exception 'Unknown or inactive beach' using errcode='22023'; end if;

  update public.partners set name=btrim(p_name),beach_id=p_beach_id
    where id=p.id and status='pending';
  insert into public.partner_private_profiles
    (id,responsible_name,phone,city,address,instagram)
  values (uid,btrim(p_responsible_name),btrim(p_phone),
    btrim(p_city),btrim(p_address),btrim(p_instagram))
  on conflict(id) do update
    set responsible_name=excluded.responsible_name,phone=excluded.phone,
        city=excluded.city,address=excluded.address,instagram=excluded.instagram,
        updated_at=now();
  perform public.write_audit('partner.profile_updated','partner',p.id::text,
    null,jsonb_build_object('profile_completed',true),
    'Informações de contato alteradas pelo responsável');
end $$;

create function public.set_my_partner_avatar(p_path text)
returns void language plpgsql security definer set search_path='' as $$
declare
  uid uuid:=public.require_role(array['partner']::public.app_role[]);
begin
  if not exists(select 1 from public.partners where owner_id=uid) then
    raise exception 'Partner account not found' using errcode='P0002'; end if;
  if p_path is null or p_path !~ ('^'||uid::text||'/avatar\.(jpg|png|webp)$') then
    raise exception 'Invalid avatar path' using errcode='22023'; end if;
  if not exists(
    select 1 from storage.objects
      where bucket_id='vento-partner-avatars' and name=p_path
  ) then raise exception 'Avatar upload not found' using errcode='P0002'; end if;
  insert into public.partner_private_profiles(id,avatar_path) values(uid,p_path)
    on conflict(id) do update set avatar_path=excluded.avatar_path,updated_at=now();
end $$;

-- Read-only flags used by admin. Private contact & payout values are never
-- returned to other partners or the public.
create function public.get_partner_profile_progress(p_partner_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); p public.partners; result jsonb;
begin
  select * into p from public.partners where id=p_partner_id;
  if p.id is null then
    raise exception 'Partner not found' using errcode='P0002'; end if;
  if uid is null or (p.owner_id<>uid and not public.is_admin()) then
    raise exception 'Not allowed to inspect this partner' using errcode='42501'; end if;
  select jsonb_build_object(
    'name',length(btrim(coalesce(p.name,'')))>=2,
    'beach',p.beach_id is not null,
    'responsible',length(btrim(coalesce(d.responsible_name,'')))>=2,
    'phone',length(btrim(coalesce(d.phone,'')))>=8,
    'city',length(btrim(coalesce(d.city,'')))>=2,
    'address',length(btrim(coalesce(d.address,'')))>=5,
    'instagram',length(btrim(coalesce(d.instagram,'')))>0,
    'avatar',length(btrim(coalesce(d.avatar_path,'')))>0,
    'payout',exists(select 1 from public.partner_payout_details pd where pd.id=p.owner_id)
  ) into result
  from public.partners p
  left join public.partner_private_profiles d on d.id=p.owner_id
  where p.id=p_partner_id;
  return result;
end $$;

-- Only the admin may see contact data needed to review the establishment.
-- Financial credentials are deliberately excluded.
create function public.get_partner_admin_details(p_partner_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $
declare result jsonb;
begin
  perform public.require_role(array['admin']::public.app_role[]);
  select jsonb_build_object(
    'responsible_name',coalesce(d.responsible_name,''),
    'phone',coalesce(d.phone,''),
    'city',coalesce(d.city,''),
    'address',coalesce(d.address,''),
    'instagram',coalesce(d.instagram,''),
    'avatar_path',d.avatar_path
  ) into result
  from public.partners p
  left join public.partner_private_profiles d on d.id=p.owner_id
  where p.id=p_partner_id;
  if result is null then
    raise exception 'Partner not found' using errcode='P0002'; end if;
  return result;
end $;

-- Database is the final enforcement point (not a client-side progress bar).
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
  end if;
  update public.partners set status=p_status where id=p.id;
  perform public.write_audit('partner.status_changed','partner',p.id::text,
    jsonb_build_object('status',p.status),
    jsonb_build_object('status',p_status),p_reason);
end $$;

revoke execute on function public.update_my_partner_profile(text,uuid,text,text,text,text,text) from public,anon;
revoke execute on function public.set_my_partner_avatar(text) from public,anon;
revoke execute on function public.get_partner_profile_progress(uuid) from public,anon;
revoke execute on function public.get_partner_admin_details(uuid) from public,anon;
revoke execute on function public.set_partner_status(uuid,public.partner_status,text) from public,anon;
grant execute on function public.update_my_partner_profile(text,uuid,text,text,text,text,text) to authenticated;
grant execute on function public.set_my_partner_avatar(text) to authenticated;
grant execute on function public.get_partner_profile_progress(uuid) to authenticated;
grant execute on function public.get_partner_admin_details(uuid) to authenticated;
grant execute on function public.set_partner_status(uuid,public.partner_status,text) to authenticated;

notify pgrst,'reload schema';
commit;
