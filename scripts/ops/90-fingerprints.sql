-- SOMENTE LEITURA. Impressão digital do banco para comparar original x restauração (sem linhas individuais, sem dados pessoais).
-- Saída: chave|valor. Mesma consulta nos dois lados, no mesmo fuso (UTC).
set time zone 'UTC';
select 'bookings|'||count(*)||'|'||md5(coalesce(string_agg(md5(row_to_json(t)::text), ',' order by t.id), '')) from public.bookings t
union all select 'booking_meetings|'||count(*)||'|'||md5(coalesce(string_agg(md5(row_to_json(t)::text), ',' order by t.id), '')) from public.booking_meetings t
union all select 'instructor_requests|'||count(*)||'|'||md5(coalesce(string_agg(md5(row_to_json(t)::text), ',' order by t.id), '')) from public.instructor_requests t
union all select 'instructor_offers|'||count(*)||'|'||md5(coalesce(string_agg(md5(row_to_json(t)::text), ',' order by t.id), '')) from public.instructor_offers t
union all select 'price_versions|'||count(*)||'|'||md5(coalesce(string_agg(md5(row_to_json(t)::text), ',' order by t.id), '')) from public.price_versions t
union all select 'functions|'||count(*)||'|'||md5(coalesce(string_agg(p.oid::regprocedure::text||md5(p.prosrc)||p.pronargdefaults||p.prosecdef||coalesce(p.proconfig::text,'')||coalesce(p.proacl::text,''), ',' order by p.oid::regprocedure::text), ''))
  from pg_proc p where p.pronamespace = 'public'::regnamespace
union all select 'policies|'||count(*)||'|'||md5(coalesce(string_agg(policyname||tablename||cmd||coalesce(qual,'')||coalesce(with_check,''), ',' order by tablename, policyname), '')) from pg_policies where schemaname = 'public'
union all select 'triggers|'||count(*)||'|'||md5(coalesce(string_agg(tgrelid::regclass::text||tgname, ',' order by tgrelid::regclass::text, tgname), '')) from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
union all select 'rls_tables|'||count(*)||'|'||md5(coalesce(string_agg(relname, ',' order by relname), '')) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relrowsecurity
order by 1;
