-- Vento | 48: the administration signs in with a second factor.
--
-- An admin account only acts as admin in a session that passed the code of
-- an authenticator app (Supabase Auth MFA: the token's "aal" claim is aal2).
-- With e-mail and password alone it has no administrative power in the
-- database: no reading other people's data and no admin function. The app
-- asks for the code right after the password (and to set it up the first
-- time). Other kinds of account are unchanged.
--
-- Every admin check goes through public.is_admin() (policies) or
-- public.require_role() (functions); both are redefined here. Independent of
-- migrations 43–46.
begin;

create function public.session_has_second_factor()
returns boolean language sql stable set search_path = '' as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2';
$$;

-- Migration 01 plus the second-factor condition.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
    and public.session_has_second_factor();
$$;

-- Migration 02 plus the second-factor condition: an admin session without it
-- is refused everywhere, also where admins pass as any other role.
create or replace function public.require_role(allowed public.app_role[]) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r public.app_role;
begin
  if uid is null then
    raise exception 'Sign in required' using errcode = '28000';
  end if;
  select role into r from public.profiles where id = uid;
  if r is null or not (r = any (allowed) or r = 'admin') then
    raise exception 'Not allowed for role %', coalesce(r::text, 'none') using errcode = '42501';
  end if;
  if r = 'admin' and not public.session_has_second_factor() then
    raise exception 'Second factor required for administrators' using errcode = '42501';
  end if;
  return uid;
end;
$$;

revoke all on function public.session_has_second_factor() from public, anon;
grant execute on function public.session_has_second_factor() to authenticated;

notify pgrst, 'reload schema';
commit;
