-- P0 #92: never exempt a preferred instructor from schedule eligibility.
-- Runs only in the disposable PostgreSQL created by scripts/test-db.sh.
do $$
declare definition text;
begin
  select pg_get_functiondef(p.oid) into strict definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='advance_instructor_offer';
  if definition not like '%if not public.instructor_can_attend(i.id,r.meetings)%' then
    raise exception 'Preferred instructor availability guard missing';
  end if;
  if definition like '%i.id is distinct from r.preferred_instructor_id%and not public.instructor_can_attend%' then
    raise exception 'Preferred instructor bypasses availability';
  end if;
end $$;
