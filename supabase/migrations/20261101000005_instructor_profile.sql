-- Vento | Private instructor personal information, avatars and payout instructions
-- Apply this file through Supabase SQL Editor after reviewing production backups.
-- Does not change booking, commission, profile-role or instructor-approval rules.

create table if not exists public.instructor_private_profiles (
  id uuid primary key references public.instructors(id) on delete cascade,
  phone text not null default '' check (char_length(phone) <= 20),
  city text not null default '' check (char_length(city) <= 80),
  bio text not null default '' check (char_length(bio) <= 500),
  avatar_path text check (avatar_path is null or (char_length(avatar_path) <= 200 and avatar_path ~ '^[a-f0-9-]{36}/avatar\.(jpg|png|webp)$')),
  updated_at timestamptz not null default now()
);

-- Payout details are private and NOT part of the public instructor row.
-- They do not trigger payment; a regulated payment provider must validate
-- the destination before actual withdrawals/transfers are enabled.
create table if not exists public.instructor_payout_details (
  id uuid primary key references public.instructors(id) on delete cascade,
  method text not null check (method in ('pix','bank')),
  holder_name text not null check (char_length(holder_name) between 2 and 120),
  pix_key text check (pix_key is null or char_length(pix_key) <= 140),
  bank_name text check (bank_name is null or char_length(bank_name) <= 100),
  branch text check (branch is null or char_length(branch) <= 30),
  account_number text check (account_number is null or char_length(account_number) <= 40),
  account_type text check (account_type is null or account_type in ('checking','savings')),
  updated_at timestamptz not null default now(),
  constraint payout_method_fields check (
    (method = 'pix' and pix_key is not null and char_length(pix_key) >= 5
      and bank_name is null and branch is null and account_number is null and account_type is null)
    or
    (method = 'bank' and bank_name is not null and branch is not null
      and account_number is not null and account_type is not null and pix_key is null)
  )
);

alter table public.instructor_private_profiles enable row level security;
alter table public.instructor_payout_details enable row level security;

revoke all on public.instructor_private_profiles, public.instructor_payout_details from anon, authenticated;
grant select on public.instructor_private_profiles, public.instructor_payout_details to authenticated;
grant insert (id, phone, city, bio, avatar_path, updated_at)
  on public.instructor_private_profiles to authenticated;
grant update (phone, city, bio, avatar_path, updated_at)
  on public.instructor_private_profiles to authenticated;
grant insert (id, method, holder_name, pix_key, bank_name, branch, account_number, account_type, updated_at)
  on public.instructor_payout_details to authenticated;
grant update (method, holder_name, pix_key, bank_name, branch, account_number, account_type, updated_at)
  on public.instructor_payout_details to authenticated;

drop policy if exists instructor_private_read_own on public.instructor_private_profiles;
create policy instructor_private_read_own on public.instructor_private_profiles
  for select to authenticated using (id = (select auth.uid()));
drop policy if exists instructor_private_insert_own on public.instructor_private_profiles;
create policy instructor_private_insert_own on public.instructor_private_profiles
  for insert to authenticated with check (id = (select auth.uid()));
drop policy if exists instructor_private_update_own on public.instructor_private_profiles;
create policy instructor_private_update_own on public.instructor_private_profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists instructor_payout_read_own on public.instructor_payout_details;
create policy instructor_payout_read_own on public.instructor_payout_details
  for select to authenticated using (id = (select auth.uid()));
drop policy if exists instructor_payout_insert_own on public.instructor_payout_details;
create policy instructor_payout_insert_own on public.instructor_payout_details
  for insert to authenticated with check (id = (select auth.uid()));
drop policy if exists instructor_payout_update_own on public.instructor_payout_details;
create policy instructor_payout_update_own on public.instructor_payout_details
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Private bucket. Individual instructors can access only their own prefix.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vento-instructor-avatars', 'vento-instructor-avatars', false, 3145728,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists vento_avatar_select_own on storage.objects;
create policy vento_avatar_select_own on storage.objects
  for select to authenticated using (
    bucket_id = 'vento-instructor-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists vento_avatar_insert_own on storage.objects;
create policy vento_avatar_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'vento-instructor-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists vento_avatar_update_own on storage.objects;
create policy vento_avatar_update_own on storage.objects
  for update to authenticated using (
    bucket_id = 'vento-instructor-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'vento-instructor-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

notify pgrst, 'reload schema';
