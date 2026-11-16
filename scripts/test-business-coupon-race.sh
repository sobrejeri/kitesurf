#!/usr/bin/env bash
# Business coupons under real concurrency, in a disposable PostgreSQL (needs a non-root user).
# 20 simultaneous orders use a coupon limited to 5 uses: exactly 5 orders are created with it,
# the other 15 are refused with "Coupon reached its limit", and used = 5.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
DATA="$(mktemp -d)"; PORT="${PORT:-54529}"
trap '"$PG_BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT
[ "$(id -u)" != "0" ] || { echo "Run as a non-root user." >&2; exit 1; }
"$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses='' -c max_connections=100" -w start >/dev/null
Q=(psql -X -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq)
"${Q[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for m in "$ROOT"/supabase/migrations/*.sql; do "${Q[@]}" -1 -f "$m" >/dev/null 2>&1; done
OWNER=00000000-0000-0000-0000-0000000c6001; ADMIN=00000000-0000-0000-0000-0000000c6002
"${Q[@]}" >/dev/null <<SQL
insert into auth.users (id, email, raw_user_meta_data) values ('$OWNER', 'o@cprace.example', '{"role":"student"}'), ('$ADMIN', 'a@cprace.example', '{"role":"student"}');
update public.profiles set role = 'admin' where id = '$ADMIN';
select set_config('request.jwt.claim.sub', '$OWNER', false); set role authenticated;
select public.create_company('Escola Cupom Corrida Ltda', 'Cupom Corrida', '12345678000195');
reset role; select set_config('request.jwt.claim.sub', '$ADMIN', false); set role authenticated;
select public.admin_set_company_status((select id from public.companies limit 1), 'active', 'Documentos conferidos');
reset role; select set_config('request.jwt.claim.sub', '$OWNER', false); set role authenticated;
select public.create_unit((select id from public.companies limit 1), 'Unidade Corrida', 'Cruz', 'Av. da Praia, 120', null, null, '06:00', '20:00');
select public.create_product((select id from public.companies limit 1), 'RACE-1', 'Produto da corrida', '', 5000, 0);
select public.record_stock_movement((select id from public.company_units limit 1), (select id from public.company_products limit 1), 'in', 100, 'Estoque inicial');
select public.create_coupon((select id from public.companies limit 1), 'CINCO', 'percent', 1000, 0, 30, 5);
SQL
read -r COMPANY UNIT PRODUCT < <("${Q[@]}" -c "select (select id from public.companies limit 1), (select id from public.company_units limit 1), (select id from public.company_products limit 1)" | tr '|' ' ')
mkdir -p "$DATA/out"
# A barrier (an advisory lock held for a moment) releases all 20 at once.
psql -X -h "$DATA" -p "$PORT" -U postgres -d postgres -Atq -c "select pg_advisory_lock(4343); select pg_sleep(1.5);" >/dev/null &
sleep 0.3
for i in $(seq 1 20); do
  (psql -X -h "$DATA" -p "$PORT" -U postgres -d postgres -Atq -v ON_ERROR_STOP=1 -c "select pg_advisory_lock_shared(4343);" -c "set role authenticated; select set_config('request.jwt.claim.sub','$OWNER',false); select public.create_order('$COMPANY'::uuid, 'Cliente $i', '88999990000', 'balcao', jsonb_build_array(jsonb_build_object('kind','product','unit_id','$UNIT','product_id','$PRODUCT','qty',1)), 'CINCO');" >/dev/null 2>"$DATA/out/$i.err" && echo ok || echo fail) > "$DATA/out/$i.res" &
done; wait
ok=$(cat "$DATA"/out/*.res | grep -c ok || true); limit=$( (grep -l "Coupon reached its limit" "$DATA"/out/*.err || true) | wc -l)
used=$("${Q[@]}" -c "select used from public.company_coupons"); orders=$("${Q[@]}" -c "select count(*) from public.company_orders where coupon_id is not null and discount_cents = 500")
[ "$ok" = 5 ] && [ "$limit" = 15 ] && [ "$used" = 5 ] && [ "$orders" = 5 ] || { echo "Coupon race failed: ok=$ok refused_by_limit=$limit used=$used orders=$orders" >&2; exit 1; }
echo "PASS: 20 simultaneous orders on a 5-use coupon created exactly 5 discounted orders"
