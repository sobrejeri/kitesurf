-- Private, read-only profile-completeness flags.
-- Admin sees only booleans (never contact/bank values); instructors see their own.
-- Does not alter approval rules or existing records.
begin;

create function public.get_instructor_profile_progress(p_instructor_id uuid)
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
    )
  ) into result
  from public.instructors i
  join public.profiles p on p.id = i.id
  left join public.instructor_private_profiles ip on ip.id = i.id
  where i.id = p_instructor_id;

  return result;
end $$;

revoke execute on function public.get_instructor_profile_progress(uuid)
  from public, anon, authenticated;
grant execute on function public.get_instructor_profile_progress(uuid)
  to authenticated;

commit;
