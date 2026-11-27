-- Deterministic fingerprints for disposable rollback rehearsals.
-- Full row content, sorted by primary key: same count alone is insufficient.
select 'bookings|' || count(*) || '|' || md5(coalesce(string_agg(to_jsonb(b)::text, E'\n' order by b.id), ''))
from public.bookings b;
select 'booking_meetings|' || count(*) || '|' || md5(coalesce(string_agg(to_jsonb(m)::text, E'\n' order by m.id), ''))
from public.booking_meetings m;
