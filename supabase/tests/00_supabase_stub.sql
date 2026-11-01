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

grant usage on schema public, auth, extensions to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;


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
create function storage.foldername(p_name text) returns text[]
language sql immutable as $$
  select string_to_array(p_name,'/');
$$;
