-- Observed via SELECT pg_get_functiondef on Kitesurf, 26/11/2026.
-- These definitions contain no account data; replay them ONLY in disposable SQL fixtures.
-- The SQL token sequence matches the repository versions, including literal strings.
CREATE OR REPLACE FUNCTION public.create_instructor_request(p_beach_id uuid, p_level lesson_level, p_language text, p_meetings jsonb, p_partner_code text DEFAULT NULL::text, p_with_transport boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid:=public.require_role(array['student']::public.app_role[]);
  price public.price_versions:=public.current_price_version();
  m jsonb; total integer:=0; len integer; req uuid;
begin
  if price.id is null then
    raise exception 'No price published' using errcode='P0002'; end if;
  if p_beach_id is null or not exists(
    select 1 from public.beaches where id=p_beach_id and active
  ) then
    raise exception 'Unknown or inactive beach' using errcode='22023'; end if;
  if p_language is null or length(p_language) not between 1 and 40 then
    raise exception 'Invalid language' using errcode='22023'; end if;
  if coalesce(p_with_transport,false) and price.transport_hourly_cents<=0 then
    raise exception 'Support vehicle not available' using errcode='22023'; end if;
  if jsonb_typeof(p_meetings)<>'array' then
    raise exception 'Invalid meetings' using errcode='22023'; end if;
  len:=jsonb_array_length(p_meetings);
  if len not between 1 and 8 then
    raise exception 'Invalid meeting count' using errcode='22023'; end if;

  for m in select value from jsonb_array_elements(p_meetings) loop
    if (m->>'hours')::integer not between 1 and 8
      or (m->>'starts_at')::timestamptz < now()+interval '1 hour' then
      raise exception 'Invalid meeting date or hours' using errcode='22023'; end if;
    total:=total+(m->>'hours')::integer;
  end loop;
  if total not between 1 and 8 then
    raise exception 'Invalid total hours' using errcode='22023'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_meetings) with ordinality a(m,n)
    join jsonb_array_elements(p_meetings) with ordinality b(m,n) on a.n<b.n
    where tstzrange(
      (a.m->>'starts_at')::timestamptz,
      (a.m->>'starts_at')::timestamptz
        +make_interval(hours=>(a.m->>'hours')::integer),'[)'
    )
    && tstzrange(
      (b.m->>'starts_at')::timestamptz,
      (b.m->>'starts_at')::timestamptz
        +make_interval(hours=>(b.m->>'hours')::integer),'[)'
    )
  ) then raise exception 'Overlapping meetings' using errcode='22023'; end if;

  insert into public.instructor_requests
    (student_id,beach_id,level,language,meetings,total_hours,with_transport,partner_code,price_version_id)
  values(
    uid,p_beach_id,p_level,p_language,p_meetings,total,coalesce(p_with_transport,false),
    nullif(upper(btrim(coalesce(p_partner_code,''))),''),price.id
  ) returning id into req;

  perform public.advance_instructor_offer(req);
  return req;
end $function$;

CREATE OR REPLACE FUNCTION public.create_instructor_request_with_preference(p_beach_id uuid, p_level lesson_level, p_language text, p_meetings jsonb, p_partner_code text, p_with_transport boolean, p_preferred_instructor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid:=public.require_role(array['student']::public.app_role[]);
  price public.price_versions:=public.current_price_version();
  m jsonb; total integer:=0; len integer; req uuid;
begin
  if price.id is null then
    raise exception 'No price published' using errcode='P0002'; end if;
  if p_beach_id is null or not exists(
    select 1 from public.beaches where id=p_beach_id and active
  ) then
    raise exception 'Unknown or inactive beach' using errcode='22023'; end if;
  if p_language is null or length(p_language) not between 1 and 40 then
    raise exception 'Invalid language' using errcode='22023'; end if;
  if coalesce(p_with_transport,false) and price.transport_hourly_cents<=0 then
    raise exception 'Support vehicle not available' using errcode='22023'; end if;
  if jsonb_typeof(p_meetings)<>'array' then
    raise exception 'Invalid meetings' using errcode='22023'; end if;
  len:=jsonb_array_length(p_meetings);
  if len not between 1 and 8 then
    raise exception 'Invalid meeting count' using errcode='22023'; end if;

  for m in select value from jsonb_array_elements(p_meetings) loop
    if (m->>'hours')::integer not between 1 and 8
      or (m->>'starts_at')::timestamptz < now()+interval '1 hour' then
      raise exception 'Invalid meeting date or hours' using errcode='22023'; end if;
    total:=total+(m->>'hours')::integer;
  end loop;
  if total not between 1 and 8 then
    raise exception 'Invalid total hours' using errcode='22023'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_meetings) with ordinality a(m,n)
    join jsonb_array_elements(p_meetings) with ordinality b(m,n) on a.n<b.n
    where tstzrange(
      (a.m->>'starts_at')::timestamptz,
      (a.m->>'starts_at')::timestamptz
        +make_interval(hours=>(a.m->>'hours')::integer),'[)'
    ) && tstzrange(
      (b.m->>'starts_at')::timestamptz,
      (b.m->>'starts_at')::timestamptz
        +make_interval(hours=>(b.m->>'hours')::integer),'[)'
    )
  ) then
    raise exception 'Overlapping meetings' using errcode='22023'; end if;

  if p_preferred_instructor_id is not null and not exists(
    select 1 from public.bookings b
    where b.student_id=uid
      and b.instructor_id=p_preferred_instructor_id
      and b.status in ('confirmed','completed')
  ) then
    raise exception 'Previous lesson with this instructor not found'
      using errcode='42501';
  end if;

  insert into public.instructor_requests (
    student_id,beach_id,level,language,meetings,total_hours,
    with_transport,partner_code,price_version_id,preferred_instructor_id
  ) values (
    uid,p_beach_id,p_level,p_language,p_meetings,total,
    coalesce(p_with_transport,false),
    nullif(upper(btrim(coalesce(p_partner_code,''))),''),
    price.id,p_preferred_instructor_id
  ) returning id into req;

  perform public.advance_instructor_offer(req);
  return req;
end $function$;

