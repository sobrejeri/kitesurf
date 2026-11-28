#!/usr/bin/env bash
# Public storefront under real concurrency, in a disposable PostgreSQL (needs a non-root user).
# 20 simultaneous anonymous orders from the SAME phone: exactly 3 are accepted (the hourly limit),
# the other 17 are refused with "Too many requests", and exactly 3 orders exist.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
DATA="$(mktemp -d)"; PORT="${PORT:-54569}"
trap '"$PG_BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT
[ "$(id -u)" != "0" ] || { echo "Run as a non-root user." >&2; exit 1; }
"$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses='' -c max_connections=100" -w start >/dev/null
Q=(psql -X -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq)
"${Q[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for m in "$ROOT"/supabase/migrations/*.sql; do "${Q[@]}" -1 -f "$m" >/dev/null 2>&1; done
OWNER=00000000-0000-0000-0000-0000000c8001; ADMIN=00000000-0000-0000-0000-0000000c8002
"${Q[@]}" >/dev/null <<SQL
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ('$OWNER', 'o@pubrace.example', '{"role":"student"}', now()), ('$ADMIN', 'a@pubrace.example', '{"role":"student"}', now());
update public.profiles set role = 'admin' where id = '$ADMIN';
select set_config('request.jwt.claim.sub', '$OWNER', false); set role authenticated;
select public.create_company('Escola Vitrine Corrida Ltda', 'Vitrine Corrida', '12345678000195');
reset role; select set_config('request.jwt.claim.sub', '$ADMIN', false); set role authenticated;
select public.admin_set_company_status((select id from public.companies limit 1), 'active', 'Documentos conferidos');
reset role; select set_config('request.jwt.claim.sub', '$OWNER', false); set role authenticated;
select public.create_unit((select id from public.companies limit 1), 'Unidade Corrida', 'Cruz', 'Av. da Praia, 120', null, null, '06:00', '20:00');
select public.create_product((select id from public.companies limit 1), 'RACE-1', 'Produto da corrida', '', 5000, 0);
select public.record_stock_movement((select id from public.company_units limit 1), (select id from public.company_products limit 1), 'in', 100, 'Estoque inicial');
select public.set_store_settings((select id from public.companies limit 1), 'Loja Corrida', '', '88999990000', 'azul');
select public.set_store_public((select id from public.companies limit 1), 'loja-corrida', true);
SQL
read -r UNIT PRODUCT < <("${Q[@]}" -c "select (select id from public.company_units limit 1), (select id from public.company_products limit 1)" | tr '|' ' ')
mkdir -p "$DATA/out"
psql -X -h "$DATA" -p "$PORT" -U postgres -d postgres -Atq -c "select pg_advisory_lock(4545); select pg_sleep(1.5);" >/dev/null &
sleep 0.3
for i in $(seq 1 20); do
  (psql -X -h "$DATA" -p "$PORT" -U postgres -d postgres -Atq -v ON_ERROR_STOP=1 -c "select pg_advisory_lock_shared(4545);" -c "set role anon; select * from public.create_public_order('loja-corrida', 'Cliente $i', '88999990500', jsonb_build_array(jsonb_build_object('kind','product','unit_id','$UNIT','product_id','$PRODUCT','qty',1)));" >/dev/null 2>"$DATA/out/$i.err" && echo ok || echo fail) > "$DATA/out/$i.res" &
done; wait
ok=$(cat "$DATA"/out/*.res | grep -c ok || true); limited=$( (grep -l "Too many requests" "$DATA"/out/*.err || true) | wc -l); rows=$("${Q[@]}" -c "select count(*) from public.company_orders where customer_phone = '88999990500'")
[ "$ok" = 3 ] && [ "$limited" = 17 ] && [ "$rows" = 3 ] || { echo "Public order race failed: accepted=$ok refused_by_limit=$limited orders=$rows" >&2; head -c 300 "$DATA"/out/*.err | head -8 >&2; exit 1; }
echo "PASS: 20 simultaneous anonymous orders from one phone created exactly 3 (the hourly limit)"
