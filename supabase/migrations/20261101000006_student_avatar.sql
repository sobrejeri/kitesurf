-- Vento: student private profile photos. Run on Supabase after checking backups.
-- Instructor photos remain in their existing private bucket. No payment changes.

create table if not exists public.student_private_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  avatar_path text check (
    avatar_path is null or (
      char_length(avatar_path) <= 200
      and avatar_path ~ '^[a-f0-9-]{36}/avatar\.(jpg|png|webp)$'
    )
  ),
  updated_at timestamptz not null default now()
);

alter table public.student_private_profiles enable row level security;
revoke all on public.student_private_profiles from anon, authenticated;
grant select on public.student_private_profiles to authenticated;
grant insert (id, avatar_path, updated_at) on public.student_private_profiles to authenticated;
grant update (avatar_path, updated_at) on public.student_private_profiles to authenticated;

drop policy if exists student_private_read_own on public.student_private_profiles;
create policy student_private_read_own on public.student_private_profiles
  for select to authenticated using (id = (select auth.uid()));
drop policy if exists student_private_insert_own on public.student_private_profiles;
create policy student_private_insert_own on public.student_private_profiles
  for insert to authenticated with check (id = (select auth.uid()));
drop policy if exists student_private_update_own on public.student_private_profiles;
create policy student_private_update_own on public.student_private_profiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Only the owning student can read/write images in their own UUID folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vento-student-avatars', 'vento-student-avatars', false, 3145728,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

drop policy if exists vento_student_avatar_select_own on storage.objects;
create policy vento_student_avatar_select_own on storage.objects
  for select to authenticated using (
    bucket_id = 'vento-student-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists vento_student_avatar_insert_own on storage.objects;
create policy vento_student_avatar_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'vento-student-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists vento_student_avatar_update_own on storage.objects;
create policy vento_student_avatar_update_own on storage.objects
  for update to authenticated using (
    bucket_id = 'vento-student-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'vento-student-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

notify pgrst, 'reload schema';
