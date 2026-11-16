#!/usr/bin/env bash
# Business cash under real concurrency, in a disposable PostgreSQL (needs a non-root user).
#  1. 10 simultaneous openings of the same unit: exactly one succeeds.
#  2. Each round: 25 simultaneous supplies racing a closing. Every accepted supply is inside the
#     stored expected amount (expected = recomputed from the movements) and every refused one was
#     refused because the session was closed. Repeated for several rounds.
# Not part of scripts/test-db.sh yet (that file is also being changed by the booking-race fix).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
DATA="$(mktemp -d)"; PORT="${PORT:-54489}"; ROUNDS="${ROUNDS:-6}"
trap '"$PG_BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT
[ "$(id -u)" != "0" ] || { echo "Run as a non-root user." >&2; exit 1; }
"$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses='' -c max_connections=100" -w start >/dev/null
Q=(psql -X -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq)
"${Q[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for m in "$ROOT"/supabase/migrations/*.sql; do "${Q[@]}" -1 -f "$m" >/dev/null 2>&1; done
OWNER=00000000-0000-0000-0000-0000000c4001; ADMIN=00000000-0000-0000-0000-0000000c4002
"${Q[@]}" >/dev/null <<SQL
insert into auth.users (id, email, raw_user_meta_data) values ('$OWNER', 'o@cxrace.example', '{"role":"student"}'), ('$ADMIN', 'a@cxrace.example', '{"role":"student"}');
update public.profiles set role = 'admin' where id = '$ADMIN';
select set_config('request.jwt.claim.sub', '$OWNER', false); set role authenticated;
select public.create_company('Escola Caixa Corrida Ltda', 'Caixa Corrida', '12345678000195');
reset role; select set_config('request.jwt.claim.sub', '$ADMIN', false); set role authenticated;
select public.admin_set_company_status((select id from public.companies limit 1), 'active', 'Documentos conferidos');
reset role; select set_config('request.jwt.claim.sub', '$OWNER', false); set role authenticated;
select public.create_unit((select id from public.companies limit 1), 'Unidade Corrida', 'Cruz', 'Av. da Praia, 120', null, null, '00:00', '23:59');
select public.set_cash_settings((select id from public.company_units limit 1), 'shift', 80, array['closing']);
SQL
UNIT=$("${Q[@]}" -c "select id from public.company_units limit 1")
as_owner="set role authenticated; select set_config('request.jwt.claim.sub','$OWNER',false);"
mkdir -p "$DATA/out"

# 1. Simultaneous openings. A barrier (an advisory lock held for a moment) releases all 10 at once.
psql -X -h "$DATA" -p "$PORT" -U postgres -d postgres -Atq -c "select pg_advisory_lock(4242); select pg_sleep(1.5);" >/dev/null &
barrier=$!; sleep 0.3
for i in $(seq 1 10); do
  (psql -X -h "$DATA" -p "$PORT" -U postgres -d postgres -Atq -v ON_ERROR_STOP=1 -c "select pg_advisory_lock_shared(4242);" -c "$as_owner select public.open_cash_session('$UNIT'::uuid, 0, 'Operador $i');" >/dev/null 2>&1 && echo ok || echo fail) > "$DATA/out/open-$i" &
done; wait
opened=$(cat "$DATA"/out/open-* | grep -c ok || true)
[ "$opened" = 1 ] || { echo "Open race failed: $opened sessions opened" >&2; exit 1; }
"${Q[@]}" -c "$as_owner select public.close_cash_session((select id from public.company_cash_sessions where status = 'open'), 0, null);" >/dev/null

# 2. Supplies racing a closing.
for round in $(seq 1 "$ROUNDS"); do
  SID=$("${Q[@]}" -c "$as_owner select public.open_cash_session('$UNIT'::uuid, 0, 'Rodada $round');" | tail -1)
  rm -f "$DATA"/out/sup-*
  for i in $(seq 1 25); do
    (psql -X -h "$DATA" -p "$PORT" -U postgres -d postgres -Atq -v ON_ERROR_STOP=1 -c "$as_owner select public.record_cash_movement('$SID'::uuid, 'supply', 100, 'Suprimento $i');" >/dev/null 2>"$DATA/out/sup-$i.err" && echo ok || echo fail) > "$DATA/out/sup-$i" &
    if [ "$i" = 12 ]; then
      (psql -X -h "$DATA" -p "$PORT" -U postgres -d postgres -Atq -v ON_ERROR_STOP=1 -c "$as_owner select public.close_cash_session('$SID'::uuid, 0, 'Fechamento durante a corrida');" >/dev/null 2>"$DATA/out/close.err" || true) &
    fi
  done; wait
  accepted=$(cat "$DATA"/out/sup-[0-9]* | grep -c ok || true)
  rows=$("${Q[@]}" -c "select count(*) from public.company_cash_movements where session_id = '$SID'")
  status=$("${Q[@]}" -c "select status from public.company_cash_sessions where id = '$SID'")
  stored=$("${Q[@]}" -c "select coalesce(expected_cents, -1) from public.company_cash_sessions where id = '$SID'")
  recomputed=$("${Q[@]}" -c "select public.company_cash_expected('$SID')")
  [ "$status" = closed ] || { echo "Round $round: the closing did not happen: $(cat "$DATA/out/close.err")" >&2; exit 1; }
  [ "$accepted" = "$rows" ] || { echo "Round $round: $accepted accepted calls but $rows rows" >&2; exit 1; }
  [ "$stored" = "$recomputed" ] && [ "$stored" = "$((rows * 100))" ] || { echo "Round $round: movement outside the closing: stored=$stored recomputed=$recomputed rows=$rows" >&2; exit 1; }
  for f in "$DATA"/out/sup-*.err; do
    n="${f%.err}"; if [ "$(cat "$n")" = fail ] && ! grep -q "not open" "$f"; then echo "Round $round: unexpected refusal: $(cat "$f")" >&2; exit 1; fi
  done
  echo "round $round: $rows supplies inside the closing, $((25 - rows)) refused after it"
done
echo "PASS: 10 simultaneous openings opened 1 session; $ROUNDS rounds of supplies racing a closing never left a movement outside the expected amount"
