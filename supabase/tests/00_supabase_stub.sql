-- Minimal stand-in for what a Supabase project provides, so the migrations can
-- be tested on a plain PostgreSQL: the auth schema, auth.uid() read from the
-- request claims, and the anon / authenticated roles.

create schema if not exists auth;
create schema if not exists extensions;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;

create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'
);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- auth.jwt(): the claims of the request's token, as in Supabase. Tests set
-- single claims (request.jwt.claim.sub, request.jwt.claim.aal). Tests written
-- before migration 48 never set "aal" and act as an administrator who already
-- passed the second factor, so it defaults to aal2;
-- 99zzzzzzzzzzzz_admin_second_factor.test.sql sets aal1 explicitly.
create function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'sub', nullif(current_setting('request.jwt.claim.sub', true), ''),
    'aal', coalesce(nullif(current_setting('request.jwt.claim.aal', true), ''), 'aal2')
  ));
$$;

grant usage on schema public, auth, extensions to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;


-- Supabase Storage stand-in: needed for avatar migration DDL in isolated PG.
-- Not an implementation of the Storage API; only bucket/policy structure.
create schema if not exists storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null
);
-- Supabase Storage enables RLS on storage.objects in its managed schema.
-- Mirror that baseline in this isolated stand-in so regression tests match production.
alter table storage.objects enable row level security;

create function storage.foldername(p_name text) returns text[]
language sql immutable as $$
  select string_to_array(p_name,'/');
$$;
