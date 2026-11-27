#!/usr/bin/env bash
# #88/#90: disposable replay + observed RPC baseline, fail-closed preflight.
# This is a synthetic fixture, NOT a restored hosted backup. No remote DSN.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
[ "$(id -u)" != 0 ] || { echo "Run as a non-root user." >&2; exit 1; }
D="$(mktemp -d)"; P="${PORT_REQUEST_INPUT:-54669}"; H="$D"
trap '"$PG_BIN/pg_ctl" -D "$D" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
"$PG_BIN/initdb" -D "$D" -U postgres --auth=trust >/dev/null
if [ "${VENTO_TEST_TCP:-0}" = 1 ]; then
  H=127.0.0.1
  "$PG_BIN/pg_ctl" -D "$D" -o "-p $P -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -w start >/dev/null
else
  "$PG_BIN/pg_ctl" -D "$D" -o "-p $P -k $D -c listen_addresses=''" -w start >/dev/null
fi
Q=("$PG_BIN/psql" -h "$H" -p "$P" -U postgres -v ON_ERROR_STOP=1 -q -At)
M="$ROOT/supabase/migrations/20261127004852_validate_request_and_booking_input.sql"
sql() { local db="$1"; shift; "${Q[@]}" -d "$db" "$@"; }
# Match the explicit service_role grants observed in hosted Supabase.
sql postgres -c "CREATE ROLE service_role NOLOGIN"
sql postgres -c "CREATE DATABASE request90_base"
sql request90_base -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for m in "$ROOT"/supabase/migrations/*.sql; do
  [[ "$(basename "$m")" < "$(basename "$M")" ]] || continue
  sql request90_base -f "$m" >/dev/null
done
sql request90_base -f "$ROOT/supabase/tests/10_rules.test.sql" >/dev/null
sql request90_base <<'SQL'
GRANT EXECUTE ON FUNCTION public.create_booking(uuid,public.lesson_level,text,jsonb,text),
  public.create_booking(uuid,public.lesson_level,text,jsonb,text,boolean),
  public.create_instructor_request(uuid,public.lesson_level,text,jsonb,text,boolean),
  public.create_instructor_request_with_preference(uuid,public.lesson_level,text,jsonb,text,boolean,uuid)
TO service_role;
SQL
data_snapshot() {
  sql "$1" <<'SQL'
SELECT md5(jsonb_build_array(
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.bookings t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.booking_meetings t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.instructor_requests t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.instructor_offers t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.audit_logs t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.profiles t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.price_versions t)
)::text);
SQL
}
metadata_snapshot() {
  sql "$1" <<'SQL'
SELECT md5(jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl,p.prosecdef,
 p.pronargdefaults,p.proargdefaults::text,p.proconfig,p.prolang,p.prorettype,p.proargtypes::text,p.proargnames)
 ORDER BY p.oid)::text)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('create_booking','create_instructor_request','create_instructor_request_with_preference');
SQL
}
catalog_snapshot() {
  sql "$1" <<'SQL'
SELECT md5(jsonb_build_array(
 (SELECT jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proowner,p.proacl)
  ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prokind='f'),
 (SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.oid)
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND NOT t.tgisinternal)
)::text);
SQL
}
for mode in replay observed; do
  db="request90_$mode"
  sql postgres -c "CREATE DATABASE $db TEMPLATE request90_base"
  if [ "$mode" = observed ]; then
    sql "$db" -f "$ROOT/supabase/reconciliation/90_observed_request_rpcs.fixture.sql"
  fi
  before_data="$(data_snapshot "$db")"; before_metadata="$(metadata_snapshot "$db")"
  sql "$db" -f "$M"
  [ "$before_data" = "$(data_snapshot "$db")" ] || { echo "FAIL data preservation $mode"; exit 1; }
  [ "$before_metadata" = "$(metadata_snapshot "$db")" ] || { echo "FAIL RPC metadata preservation $mode"; exit 1; }
  sql "$db" -f "$ROOT/supabase/reconciliation/90_request_input_guard.regression.sql" >/dev/null
  [ "$before_data" = "$(data_snapshot "$db")" ] || { echo "FAIL regression cleanup $mode"; exit 1; }
  echo "PASS: request input migration $mode baseline, data/ACL/defaults/OID preserved, 132 RPC matrix calls"
done
for mutation in body acl defaults service_role helper; do
  db="request90_drift_$mutation"
  sql postgres -c "CREATE DATABASE $db TEMPLATE request90_base"
  case "$mutation" in
    body) sql "$db" <<'SQL'
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.create_instructor_request(uuid,public.lesson_level,text,jsonb,text,boolean)'::regprocedure);
 EXECUTE replace(d,E'begin\n',E'begin\n  -- unreviewed drift\n');
END $$;
SQL
      ;;
    acl) sql "$db" -c "GRANT EXECUTE ON FUNCTION public.create_booking(uuid,public.lesson_level,text,jsonb,text,boolean) TO anon";;
    defaults) sql "$db" <<'SQL'
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.create_booking(uuid,public.lesson_level,text,jsonb,text,boolean)'::regprocedure);
 EXECUTE replace(d,'p_with_transport boolean)','p_with_transport boolean DEFAULT false)');
END $$;
SQL
      ;;
    service_role) sql "$db" -c "REVOKE EXECUTE ON FUNCTION public.create_booking(uuid,public.lesson_level,text,jsonb,text,boolean) FROM service_role";;
    helper) sql "$db" -c "CREATE FUNCTION public.guard_request_input() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NEW; END;'";;
  esac
  before_data="$(data_snapshot "$db")"; before_catalog="$(catalog_snapshot "$db")"
  if sql "$db" -f "$M" >"$D/rejection.log" 2>&1; then
    echo "FAIL migration accepted $mutation drift"; exit 1
  fi
  if ! grep -Eq 'Unreviewed request input baseline|helpers already exist' "$D/rejection.log"; then
    cat "$D/rejection.log" >&2; echo "FAIL wrong rejection $mutation"; exit 1
  fi
  [ "$before_data" = "$(data_snapshot "$db")" ] || { echo "FAIL data changed after rejection $mutation"; exit 1; }
  [ "$before_catalog" = "$(catalog_snapshot "$db")" ] || { echo "FAIL DDL leaked after rejection $mutation"; exit 1; }
  echo "PASS: request input migration rejects $mutation drift atomically"
done

