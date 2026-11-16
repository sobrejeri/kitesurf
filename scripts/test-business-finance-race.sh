#!/usr/bin/env bash
# Business finance under real concurrency, in a disposable PostgreSQL (needs a non-root user).
#  1. 20 simultaneous external payments of 14,30 to an instructor who is owed 143,00: exactly 10 are
#     recorded, the rest are refused, and paid = owed.
#  2. 20 simultaneous payments of 10,00 on an account of 100,00: exactly 10 are recorded.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
DATA="$(mktemp -d)"; PORT="${PORT:-54549}"
trap '"$PG_BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT
[ "$(id -u)" != "0" ] || { echo "Run as a non-root user." >&2; exit 1; }
"$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses='' -c max_connections=100" -w start >/dev/null
Q=(psql -X -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq)
"${Q[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for m in "$ROOT"/supabase/migrations/*.sql; do "${Q[@]}" -1 -f "$m" >/dev/null 2>&1; done
OWNER=00000000-0000-0000-0000-0000000c7001; ADMIN=00000000-0000-0000-0000-0000000c7002; INS=00000000-0000-0000-0000-0000000c7003
"${Q[@]}" >/dev/null <<SQL
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ('$OWNER', 'o@finrace.example', '{"role":"student"}', now()), ('$ADMIN', 'a@finrace.example', '{"role":"student"}', now()), ('$INS', 'i@finrace.example', '{"role":"instructor"}', now());
update public.profiles set role = 'admin' where id = '$ADMIN';
update public.instructors set status = 'approved', approved_at = now() where id = '$INS';
select set_config('request.jwt.claim.sub', '$OWNER', false); set role authenticated;
select public.create_company('Escola Financas Corrida Ltda', 'Fin Corrida', '12345678000195');
reset role; select set_config('request.jwt.claim.sub', '$ADMIN', false); set role authenticated;
select public.admin_set_company_status((select id from public.companies limit 1), 'active', 'Documentos conferidos');
reset role; select set_config('request.jwt.claim.sub', '$OWNER', false); set role authenticated;
select public.create_unit((select id from public.companies limit 1), 'Unidade Corrida', 'Cruz', 'Av. da Praia, 120', null, null, '00:00', '23:59');
select public.invite_instructor((select id from public.companies limit 1), 'i@finrace.example', array[(select id from public.company_units limit 1)], 5500);
reset role; select set_config('request.jwt.claim.sub', '$INS', false); set role authenticated;
select public.accept_company_invitation((select id from public.company_invitations limit 1));
reset role; select set_config('request.jwt.claim.sub', '$OWNER', false); set role authenticated;
select public.create_service((select id from public.companies limit 1), 'Aula iniciante', 120, 2, '', 26000);
select public.set_unit_service((select id from public.company_services limit 1), (select id from public.company_units limit 1), 'Praia', array[0,1,2,3,4,5,6]::smallint[], array[(select id from public.company_instructor_links limit 1)], true);
select public.create_external_booking((select id from public.company_units limit 1), (select id from public.company_services limit 1), '$INS'::uuid, 'Cliente Corrida', '88999990000',
  (((now() at time zone 'America/Fortaleza')::date + 2 + time '10:00') at time zone 'America/Fortaleza'));
reset role;
update public.company_external_bookings set starts_at = now() - interval '3 hours';
select set_config('request.jwt.claim.sub', '$OWNER', false); set role authenticated;
select public.complete_external_booking((select id from public.company_external_bookings limit 1));
select public.create_due((select id from public.company_units limit 1), 'payable', 'Fornecedor', (now() at time zone 'America/Fortaleza')::date, 10000);
SQL
read -r LINK DUE < <("${Q[@]}" -c "select (select id from public.company_instructor_links limit 1), (select id from public.company_dues limit 1)" | tr '|' ' ')
owed=$("${Q[@]}" -c "select public.company_instructor_due_cents('$LINK')"); [ "$owed" = 14300 ] || { echo "Fixture: owed=$owed" >&2; exit 1; }
as_owner="set role authenticated; select set_config('request.jwt.claim.sub','$OWNER',false);"
mkdir -p "$DATA/out"
race() { # $1 = name, $2 = sql
  psql -X -h "$DATA" -p "$PORT" -U postgres -d postgres -Atq -c "select pg_advisory_lock(4444); select pg_sleep(1.5);" >/dev/null &
  sleep 0.3
  for i in $(seq 1 20); do
    (psql -X -h "$DATA" -p "$PORT" -U postgres -d postgres -Atq -v ON_ERROR_STOP=1 -c "select pg_advisory_lock_shared(4444);" -c "$as_owner ${2//__I__/$i}" >/dev/null 2>"$DATA/out/$1-$i.err" && echo ok || echo fail) > "$DATA/out/$1-$i.res" &
  done; wait
  cat "$DATA"/out/$1-*.res | grep -c ok || true
}
ok1=$(race pay "select public.record_instructor_payment('$LINK'::uuid, 1430, 'pix', 'PIX-__I__');")
paid=$("${Q[@]}" -c "select public.company_instructor_paid_cents('$LINK')"); rows=$("${Q[@]}" -c "select count(*) from public.company_instructor_payments")
[ "$ok1" = 10 ] && [ "$paid" = 14300 ] && [ "$rows" = 10 ] || { echo "Instructor payment race failed: ok=$ok1 paid=$paid rows=$rows owed=14300" >&2; exit 1; }
ok2=$(race due "select public.record_due_payment('$DUE'::uuid, 1000, (now() at time zone 'America/Fortaleza')::date);")
sum=$("${Q[@]}" -c "select coalesce(sum(cents),0) from public.company_due_payments")
[ "$ok2" = 10 ] && [ "$sum" = 10000 ] || { echo "Account payment race failed: ok=$ok2 sum=$sum of 10000" >&2; exit 1; }
echo "PASS: 20 simultaneous instructor payments recorded exactly what was owed (10); 20 simultaneous account payments recorded exactly the account (10)"
