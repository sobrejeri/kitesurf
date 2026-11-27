-- Opt-in only. Registration is disabled in the database as well as the app.
begin;

create table public.push_subscription_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into public.push_subscription_settings(singleton, enabled) values (true, false);
alter table public.push_subscription_settings enable row level security;
revoke all on public.push_subscription_settings from public, anon, authenticated;

create function public.validate_push_subscription_input(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security invoker set search_path = '' as $$
declare public_key bytea; auth_key bytea;
begin
  if p_endpoint is null or char_length(p_endpoint) > 2048
    or p_endpoint ~ '[[:space:][:cntrl:]]'
    or p_endpoint !~ '^https://(fcm[.]googleapis[.]com|([a-z0-9-]+[.])?push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-z0-9-]+[.]notify[.]windows[.]com)/[A-Za-z0-9_~.!$&''()*+,;=:@%/?-]+$'
    or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{87}$'
    or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'Invalid push subscription' using errcode = '22023';
  end if;
  begin
    public_key := pg_catalog.decode(pg_catalog.translate(p_p256dh, '-_', '+/') || '=', 'base64');
    auth_key := pg_catalog.decode(pg_catalog.translate(p_auth, '-_', '+/') || '==', 'base64');
  exception when data_exception then
    raise exception 'Invalid push subscription' using errcode = '22023';
  end;
  if octet_length(public_key) <> 65 or get_byte(public_key, 0) <> 4 or octet_length(auth_key) <> 16
    or pg_catalog.translate(pg_catalog.rtrim(pg_catalog.replace(pg_catalog.encode(public_key, 'base64'), E'\n', ''), '='), '+/', '-_') <> p_p256dh
    or pg_catalog.translate(pg_catalog.rtrim(pg_catalog.encode(auth_key, 'base64'), '='), '+/', '-_') <> p_auth then
    raise exception 'Invalid push subscription' using errcode = '22023';
  end if;
end $$;
revoke all on function public.validate_push_subscription_input(text,text,text) from public, anon, authenticated;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references auth.sessions(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 10 and 2048),
  p256dh text,
  auth_secret text,
  expiration_time timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscription_revoked_keys check (
    (revoked_at is null and p256dh is not null and auth_secret is not null)
    or (revoked_at is not null and p256dh is null and auth_secret is null)
  )
);
create index push_subscriptions_owner_session on public.push_subscriptions(owner_id, session_id);
alter table public.push_subscriptions enable row level security;
create policy push_subscription_owner_read on public.push_subscriptions for select to authenticated
using ((select auth.uid()) = owner_id);
revoke all on public.push_subscriptions from public, anon, authenticated;
grant select (id, owner_id, session_id, endpoint, expiration_time, revoked_at, created_at, updated_at)
  on public.push_subscriptions to authenticated;
-- The future trusted sender needs secrets; the app never uses this role.
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant select on public.push_subscriptions to service_role;
  end if;
end $$;

create function public.register_my_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_expiration_time timestamptz default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_role(array['student','instructor','admin','partner']::public.app_role[]);
  sid_text text := auth.jwt()->>'session_id';
  sid uuid;
  result uuid;
begin
  if not coalesce((select enabled from public.push_subscription_settings where singleton), false) then
    raise exception 'Push registration disabled' using errcode = '55000';
  end if;
  if sid_text is null or sid_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Authenticated session required' using errcode = '42501';
  end if;
  sid := sid_text::uuid;
  if not exists(select 1 from auth.sessions s where s.id=sid and s.user_id=uid) then
    raise exception 'Authenticated session required' using errcode = '42501';
  end if;
  perform public.validate_push_subscription_input(p_endpoint, p_p256dh, p_auth);
  if p_expiration_time is not null and (not isfinite(p_expiration_time) or p_expiration_time <= now()) then
    raise exception 'Invalid subscription expiry' using errcode = '22023';
  end if;
  insert into public.push_subscriptions(owner_id, session_id, endpoint, p256dh, auth_secret, expiration_time)
    values (uid, sid, p_endpoint, p_p256dh, p_auth, p_expiration_time)
  on conflict (endpoint) do update set
    session_id = excluded.session_id,
    p256dh = excluded.p256dh,
    auth_secret = excluded.auth_secret,
    expiration_time = excluded.expiration_time,
    revoked_at = null,
    updated_at = now()
  where public.push_subscriptions.owner_id = uid
  returning id into result;
  -- Ownership is never reassigned, including endpoints revoked by another account.
  if result is null then raise exception 'Push subscription unavailable' using errcode = '42501'; end if;
  return result;
end $$;
revoke all on function public.register_my_push_subscription(text,text,text,timestamptz) from public, anon;
grant execute on function public.register_my_push_subscription(text,text,text,timestamptz) to authenticated;

create function public.revoke_my_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_role(array['student','instructor','admin','partner']::public.app_role[]);
begin
  if p_endpoint is null or char_length(p_endpoint) > 2048 then
    raise exception 'Invalid push subscription' using errcode = '22023';
  end if;
  update public.push_subscriptions set revoked_at = now(), p256dh = null, auth_secret = null, updated_at = now()
    where owner_id = uid and endpoint = p_endpoint and revoked_at is null;
end $$;
revoke all on function public.revoke_my_push_subscription(text) from public, anon;
grant execute on function public.revoke_my_push_subscription(text) to authenticated;

create function public.revoke_my_push_session_subscriptions()
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_role(array['student','instructor','admin','partner']::public.app_role[]);
  sid_text text := auth.jwt()->>'session_id';
begin
  if sid_text is null or sid_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Authenticated session required' using errcode = '42501';
  end if;
  update public.push_subscriptions set revoked_at = now(), p256dh = null, auth_secret = null, updated_at = now()
    where owner_id = uid and session_id = sid_text::uuid and revoked_at is null;
end $$;
revoke all on function public.revoke_my_push_session_subscriptions() from public, anon;
grant execute on function public.revoke_my_push_session_subscriptions() to authenticated;

notify pgrst, 'reload schema';
commit;
