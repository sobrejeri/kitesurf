-- P0: close the legacy five-argument create_booking path.
-- The six-argument implementation is protected by the instructor row lock and
-- post-lock availability recheck in 20261115100000_fix_create_booking_instructor_race.sql.
-- Preserve the old RPC signature for existing clients, but delegate every booking
-- to the single concurrency-safe implementation. No data or payment changes.
--
-- IMPORTANT: deploy this migration only AFTER the 20261115100000 migration.
begin;

create or replace function public.create_booking(
  p_beach_id uuid,
  p_level public.lesson_level,
  p_language text,
  p_meetings jsonb,
  p_partner_code text default null
) returns uuid
language sql
security invoker
set search_path = ''
as $$
  select public.create_booking(
    p_beach_id, p_level, p_language, p_meetings, p_partner_code, false
  );
$$;

-- The old five-argument function was SECURITY DEFINER. Keep the RPC callable
-- only by authenticated users; the six-argument function checks student role.
revoke all on function public.create_booking(uuid, public.lesson_level, text, jsonb, text)
  from public, anon;
grant execute on function public.create_booking(uuid, public.lesson_level, text, jsonb, text)
  to authenticated;

notify pgrst, 'reload schema';
commit;
