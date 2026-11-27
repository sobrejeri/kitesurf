#!/usr/bin/env bash
# Disposable local rehearsal: exact replay/observed baselines, no hosted DSN.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
DATA="$(mktemp -d)"; PORT="${PORT_TEST_PAYMENT_GUARD:-54684}"
trap '"$PG_BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT
"$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -w start >/dev/null
Q=("$PG_BIN/psql" -X -h127.0.0.1 -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -At)
M="$ROOT/supabase/migrations/20261127021747_reject_test_payment_without_instructor.sql"
"${Q[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for migration in "$ROOT"/supabase/migrations/*.sql; do
  [ "$migration" = "$M" ] && continue
  "${Q[@]}" -f "$migration" >/dev/null
done
"${Q[@]}" -f "$ROOT/supabase/tests/10_rules.test.sql" >/dev/null
metadata() { "${Q[@]}" -c "select md5((to_jsonb(p)-'prosrc')::text) from pg_proc p where oid='public.confirm_test_payment(uuid)'::regprocedure"; }
body() { "${Q[@]}" -c "select md5(prosrc) from pg_proc where oid='public.confirm_test_payment(uuid)'::regprocedure"; }
data() { "${Q[@]}" -c "select md5(jsonb_build_array((select jsonb_agg(to_jsonb(t) order by id) from bookings t),(select jsonb_agg(to_jsonb(t) order by id) from booking_meetings t),(select jsonb_agg(to_jsonb(t) order by id) from audit_logs t),(select jsonb_agg(to_jsonb(t) order by id) from instructors t))::text)"; }
for baseline in replay observed; do
  if [ "$baseline" = replay ]; then
    "${Q[@]}" -f "$ROOT/supabase/migrations/20261120100000_confirm_payment_lock_order.sql"
  else
    "${Q[@]}" -c 'create role service_role nologin; grant execute on function public.confirm_test_payment(uuid) to service_role'
    "${Q[@]}" -f "$ROOT/scripts/fixtures/confirm-test-payment-observed.sql"
  fi
  before_meta="$(metadata)"; before_body="$(body)"; before_data="$(data)"
  "${Q[@]}" -f "$M"
  [ "$(metadata)" = "$before_meta" ] || { echo 'FAIL: metadata/OID/owner/ACL/default drift'; exit 1; }
  [ "$(body)" != "$before_body" ] || { echo 'FAIL: guard was not installed'; exit 1; }
  [ "$(data)" = "$before_data" ] || { echo 'FAIL: migration changed business data'; exit 1; }
  "${Q[@]}" -f "$ROOT/supabase/tests/89o_test_payment_instructor_required.test.sql"
  [ "$(data)" = "$before_data" ] || { echo 'FAIL: regression leaked synthetic rows'; exit 1; }
  echo "PASS: $baseline baseline preserves metadata and data; NULL/owner/valid/duplicate cases pass"
done
# Fail closed for unknown source, ACL, configuration or defaults. All of these
# mutate only this disposable cluster. A rejected migration must change nothing.
for drift in body acl search_path defaults; do
  "${Q[@]}" -f "$ROOT/scripts/fixtures/confirm-test-payment-observed.sql"
  "${Q[@]}" -c "alter function public.confirm_test_payment(uuid) set search_path=''; revoke all on function public.confirm_test_payment(uuid) from anon"
  case "$drift" in
    body) "${Q[@]}" -c "do \$\$ declare f oid:='public.confirm_test_payment(uuid)'::regprocedure; s text; begin select prosrc into s from pg_proc where oid=f; execute replace(pg_get_functiondef(f),s,s||E'\n-- drift probe'); end \$\$" ;;
    acl) "${Q[@]}" -c 'grant execute on function public.confirm_test_payment(uuid) to anon' ;;
    search_path) "${Q[@]}" -c 'alter function public.confirm_test_payment(uuid) set search_path=public' ;;
    defaults) "${Q[@]}" -c "do \$\$ begin execute replace(pg_get_functiondef('public.confirm_test_payment(uuid)'::regprocedure),'p_booking_id uuid)','p_booking_id uuid DEFAULT NULL::uuid)'); end \$\$" ;;
  esac
  before_meta="$(metadata)"; before_body="$(body)"; before_data="$(data)"
  if "${Q[@]}" -f "$M" >"$DATA/drift.log" 2>&1; then echo "FAIL: accepted $drift drift"; exit 1; fi
  grep -Eq 'baseline drift|metadata drift|ACL drift' "$DATA/drift.log" || { cat "$DATA/drift.log"; exit 1; }
  [ "$(metadata)" = "$before_meta" ] && [ "$(body)" = "$before_body" ] && [ "$(data)" = "$before_data" ] || { echo 'FAIL: rejection was not atomic'; exit 1; }
  echo "PASS: $drift drift rejected atomically"
done
