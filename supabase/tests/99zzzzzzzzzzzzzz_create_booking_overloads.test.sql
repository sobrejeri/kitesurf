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

  -- The six-argument RPC must require an explicit transport flag. Otherwise
  -- PostgreSQL/PostgREST cannot resolve five-argument calls unambiguously.
  if pg_get_function_arguments(v_six) ~* 'p_(partner_code|with_transport)[^,]*default' then
    raise exception 'Six-argument RPC must not have trailing defaults: ambiguous overload or invalid signature';
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
  if has_function_privilege('anon', v_six, 'EXECUTE')
     or has_function_privilege('PUBLIC', v_six, 'EXECUTE') then
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
