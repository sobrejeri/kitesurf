-- Contract regression: both create_booking overloads must use the same safe path.
-- Run after migrations, on disposable PostgreSQL. No fixtures or writes.
do $$
declare
  v_six oid;
  v_five oid;
  six_def text;
  five_def text;
begin
  v_six := to_regprocedure('public.create_booking(uuid,public.lesson_level,text,jsonb,text,boolean)');
  v_five := to_regprocedure('public.create_booking(uuid,public.lesson_level,text,jsonb,text)');
  if v_six is null or v_five is null then
    raise exception 'Both booking RPC overloads are required for client compatibility';
  end if;

  -- Inspect catalog defaults directly: formatting changes in pg_get_function_arguments
  -- must not hide an ambiguous five-argument PostgREST call.
  if (select pronargdefaults from pg_proc where oid = v_six) <> 0 then
    raise exception 'Six-argument booking RPC must have zero argument defaults';
  end if;
  if (select pronargdefaults from pg_proc where oid = v_five) <> 1 then
    raise exception 'Legacy five-argument RPC must keep exactly one optional partner code';
  end if;

  -- The six-argument RPC must require an explicit transport flag. Otherwise
  -- PostgreSQL/PostgREST cannot resolve five-argument calls unambiguously.
  if pg_get_function_arguments(v_six) ~* 'p_(partner_code|with_transport)[^,]*default' then
    raise exception 'Six-argument RPC must not have trailing defaults: ambiguous overload or invalid signature';
  end if;

  -- The fresh-snapshot recheck only prevents double booking if the helper
  -- still checks committed meeting collisions and instructor time off.
  if to_regprocedure('public.instructor_can_attend(uuid,jsonb)') is null then
    raise exception 'Instructor availability helper missing';
  end if;
  if position('booking_meetings' in lower(pg_get_functiondef(
       'public.instructor_can_attend(uuid,jsonb)'::regprocedure))) = 0
     -- #91: o bloqueio de horário agora vive em instructor_slot_open, chamada por instructor_can_attend.
     or position('instructor_slot_open' in lower(pg_get_functiondef(
       'public.instructor_can_attend(uuid,jsonb)'::regprocedure))) = 0
     or position('instructor_time_off' in lower(pg_get_functiondef(
       'public.instructor_slot_open(uuid,timestamptz,timestamptz)'::regprocedure))) = 0 then
    raise exception 'Post-lock availability helper must check booking collisions and time off';
  end if;

  six_def := pg_get_functiondef(v_six);
  five_def := pg_get_functiondef(v_five);
  if position('for update of i skip locked' in lower(six_def)) = 0
     or position('if not public.instructor_can_attend(chosen_instructor, p_meetings)' in lower(six_def)) = 0 then
    raise exception 'Six-argument booking RPC lacks the post-lock concurrency check';
  end if;
  if position('public.create_booking(' in lower(five_def)) = 0
     or position('p_partner_code, false' in lower(five_def)) = 0 then
    raise exception 'Legacy booking RPC does not delegate to the safe six-argument path';
  end if;
  if (select prosecdef from pg_proc where oid = v_five) then
    raise exception 'Legacy delegate must not bypass permissions with SECURITY DEFINER';
  end if;
  if has_function_privilege('anon', v_six, 'EXECUTE') then
    raise exception 'Six-argument SECURITY DEFINER booking RPC must not be publicly executable';
  end if;
  if not has_function_privilege('authenticated', v_six, 'EXECUTE') then
    raise exception 'Authenticated clients lost six-argument booking RPC access';
  end if;
  if has_function_privilege('anon', v_five, 'EXECUTE') then
    raise exception 'Anonymous callers must not execute legacy booking RPC';
  end if;
  if not has_function_privilege('authenticated', v_five, 'EXECUTE') then
    raise exception 'Authenticated clients lost legacy booking RPC access';
  end if;
  raise notice 'PASS: safe booking overload delegation and permissions';
end $$;

-- Parse/resolve the exact named-argument shapes used by RPC callers.
-- PREPARE does not execute the SECURITY DEFINER function or create bookings.
-- This checks PostgreSQL overload resolution; real PostgREST HTTP remains E2E.
prepare vk_booking_four_args as
  select public.create_booking(
    p_beach_id => null::uuid,
    p_level => null::public.lesson_level,
    p_language => null::text,
    p_meetings => null::jsonb
  );
deallocate vk_booking_four_args;

prepare vk_booking_five_args as
  select public.create_booking(
    p_beach_id => null::uuid,
    p_level => null::public.lesson_level,
    p_language => null::text,
    p_meetings => null::jsonb,
    p_partner_code => null::text
  );
deallocate vk_booking_five_args;

prepare vk_booking_six_args as
  select public.create_booking(
    p_beach_id => null::uuid,
    p_level => null::public.lesson_level,
    p_language => null::text,
    p_meetings => null::jsonb,
    p_partner_code => null::text,
    p_with_transport => false
  );
deallocate vk_booking_six_args;
