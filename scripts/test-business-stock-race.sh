#!/usr/bin/env bash
# Business stock under real concurrency, in a disposable PostgreSQL (needs a non-root user).
#  1. 30 simultaneous sales of 1 unit against a balance of 10: exactly 10 succeed, the rest are
#     refused, the balance ends at 0 and equals the sum of the ledger.
#  2. 20 simultaneous first entries for a brand-new (unit, product) pair: all succeed, balance 20.
# Not part of scripts/test-db.sh yet (that file is also being changed by the booking-race fix).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
DATA="$(mktemp -d)"; PORT="${PORT:-54449}"
trap '"$PG_BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT
[ "$(id -u)" != "0" ] || { echo "Run as a non-root user." >&2; exit 1; }
"$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses='' -c max_connections=100" -w start >/dev/null
Q=(psql -X -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq)
"${Q[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for m in "$ROOT"/supabase/migrations/*.sql; do "${Q[@]}" -1 -f "$m" >/dev/null 2>&1; done
OWNER=00000000-0000-0000-0000-0000000c0001; ADMIN=00000000-0000-0000-0000-0000000c0002
"${Q[@]}" <<SQL
insert into auth.users (id, email, raw_user_meta_data) values ('$OWNER', 'o@race.example', '{"role":"student"}'), ('$ADMIN', 'a@race.example', '{"role":"student"}');
update public.profiles set role = 'admin' where id = '$ADMIN';
set role authenticated; select set_config('request.jwt.claim.sub', '$OWNER', false);
select public.create_company('Escola Corrida Ltda', 'Corrida', '12345678000195') \gset c_
reset role; select set_config('request.jwt.claim.sub', '$ADMIN', false); set role authenticated;
select public.admin_set_company_status(:'c_create_company'::uuid, 'active', 'Documentos conferidos');
reset role; select set_config('request.jwt.claim.sub', '$OWNER', false); set role authenticated;
select public.create_unit(:'c_create_company'::uuid, 'Unidade Corrida', 'Cruz', 'Av. da Praia, 120', null, null, '06:00', '20:00') as unit \gset u_
select public.create_product(:'c_create_company'::uuid, 'RACE-1', 'Produto da corrida', '', 5000, 0) as p \gset p1_
select public.create_product(:'c_create_company'::uuid, 'RACE-2', 'Produto novo', '', 5000, 0) as p \gset p2_
select public.record_stock_movement(:'u_unit'::uuid, :'p1_p'::uuid, 'in', 10, 'Estoque inicial');
\echo :u_unit :p1_p :p2_p
SQL
read -r UNIT P1 P2 < <("${Q[@]}" -c "select (select id from public.company_units limit 1), (select id from public.company_products where sku='RACE-1'), (select id from public.company_products where sku='RACE-2')" | tr '|' ' ')
mkdir -p "$DATA/out"
run() { # $1 = type, $2 = product, $3 = id
  psql -X -h "$DATA" -p "$PORT" -U postgres -d postgres -Atq -v ON_ERROR_STOP=1 -c "set role authenticated; select set_config('request.jwt.claim.sub','$OWNER',false); select public.record_stock_movement('$UNIT'::uuid,'$2'::uuid,'$1',1,'Corrida $3');" >/dev/null 2>"$DATA/out/$1-$3.err" && echo ok > "$DATA/out/$1-$3.res" || echo fail > "$DATA/out/$1-$3.res"
}
for i in $(seq 1 30); do run sale "$P1" "$i" & done; wait
ok=$(cat "$DATA"/out/sale-*.res | grep -c ok || true); fail=$(cat "$DATA"/out/sale-*.res | grep -c fail || true)
bal=$("${Q[@]}" -c "select qty from public.company_stock_balances where product_id='$P1'"); led=$("${Q[@]}" -c "select sum(qty) from public.company_stock_movements where product_id='$P1'")
[ "$ok" = 10 ] && [ "$fail" = 20 ] && [ "$bal" = 0 ] && [ "$led" = 0 ] || { echo "Oversell race failed: ok=$ok fail=$fail balance=$bal ledger_sum=$led" >&2; exit 1; }
grep -L "Stock cannot go negative" "$DATA"/out/sale-*.err | while read -r f; do [ "$(cat "${f%.err}.res")" = ok ] || { echo "A refused sale had an unexpected error: $(cat "$f")" >&2; exit 1; }; done
for i in $(seq 1 20); do run in "$P2" "$i" & done; wait
ok2=$(cat "$DATA"/out/in-*.res | grep -c ok || true); bal2=$("${Q[@]}" -c "select qty from public.company_stock_balances where product_id='$P2'")
[ "$ok2" = 20 ] && [ "$bal2" = 20 ] || { echo "First-insert race failed: ok=$ok2 balance=$bal2" >&2; cat "$DATA"/out/in-*.err | head -3 >&2; exit 1; }
echo "PASS: 30 simultaneous sales against 10 in stock sold exactly 10; 20 simultaneous first entries all counted (balance 20)"
