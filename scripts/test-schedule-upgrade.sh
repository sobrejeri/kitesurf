#!/usr/bin/env bash
# #91: apply agenda only AFTER the current baseline (guard #90 + revoked starter).
# Disposable PostgreSQL only; no remote DSN or hosted DDL.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
[ "$(id -u)" != 0 ] || { echo 'Run as a non-root user.' >&2; exit 1; }
D="$(mktemp -d)"; P="${PORT_SCHEDULE_UPGRADE:-54671}"; H="$D"
trap '"$PG_BIN/pg_ctl" -D "$D" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
"$PG_BIN/initdb" -D "$D" -U postgres --auth=trust >/dev/null
if [ "${VENTO_TEST_TCP:-0}" = 1 ]; then
 H=127.0.0.1
 "$PG_BIN/pg_ctl" -D "$D" -o "-p $P -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -w start >/dev/null
else
 "$PG_BIN/pg_ctl" -D "$D" -o "-p $P -k $D -c listen_addresses=''" -w start >/dev/null
fi
Q=("$PG_BIN/psql" -X -h "$H" -p "$P" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -At)
M="$ROOT/supabase/migrations/20261125100000_instructor_schedule_v2.sql"
"${Q[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for m in "$ROOT"/supabase/migrations/*.sql; do
 [ "$m" = "$M" ] && continue
 "${Q[@]}" -1 -f "$m" >/dev/null
done
"${Q[@]}" -f "$ROOT/supabase/tests/10_rules.test.sql" >/dev/null
# Model the managed project's service_role EXECUTE without giving it to the browser.
"${Q[@]}" <<'SQL'
CREATE ROLE service_role NOLOGIN;
GRANT EXECUTE ON FUNCTION public.start_meeting(uuid,text),public.start_ordered_meeting(uuid,text) TO service_role;
DO $$ BEGIN
 ASSERT NOT has_function_privilege('authenticated','public.start_meeting(uuid,text)','EXECUTE'),'starter must already be revoked';
 ASSERT has_function_privilege('authenticated','public.start_ordered_meeting(uuid,text)','EXECUTE'),'ordered starter remains available';
 ASSERT to_regprocedure('public.validate_booking_input(uuid,public.lesson_level,text,jsonb)') IS NOT NULL,'guard90 must already exist';
END $$;
SQL
data_snapshot() {
 "${Q[@]}" <<'SQL'
SELECT md5(jsonb_build_array(
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.bookings t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.booking_meetings t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.instructor_requests t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.instructor_offers t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.audit_logs t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.app_notifications t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.profiles t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.price_versions t)
)::text);
SQL
}
protected_functions() {
 "${Q[@]}" <<'SQL'
SELECT md5(jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proowner,p.proacl,
 p.pronargdefaults,pg_get_expr(p.proargdefaults,0),p.prosecdef,p.proconfig) ORDER BY p.oid)::text)
FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN
 ('start_meeting','start_ordered_meeting','create_booking','create_instructor_request',
  'create_instructor_request_with_preference','validate_booking_input','validate_instructor_request_meetings');
SQL
}
replaced_metadata() {
 "${Q[@]}" <<'SQL'
SELECT md5(jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl,p.prosecdef,p.proconfig,
 p.pronargdefaults,pg_get_expr(p.proargdefaults,0),p.proargtypes::text,p.prorettype) ORDER BY p.oid)::text)
FROM pg_proc p WHERE p.oid IN
 ('public.instructor_can_attend(uuid,jsonb)'::regprocedure,
  'public.can_move_meeting(uuid,uuid,timestamptz,integer)'::regprocedure,
  'public.save_my_schedule(integer[],time,time,integer)'::regprocedure,
  'public.block_my_time(timestamptz,timestamptz,text)'::regprocedure,
  'public.unblock_my_time(uuid)'::regprocedure);
SQL
}
BEFORE_DATA="$(data_snapshot)"; BEFORE_PROTECTED="$(protected_functions)"; BEFORE_REPLACED="$(replaced_metadata)"
"${Q[@]}" -1 -f "$M" >/dev/null
[ "$(data_snapshot)" = "$BEFORE_DATA" ] || { echo 'FAIL: agenda upgrade changed business data'; exit 1; }
[ "$(protected_functions)" = "$BEFORE_PROTECTED" ] || { echo 'FAIL: agenda upgrade changed guard/starters/OID/ACL/defaults'; exit 1; }
[ "$(replaced_metadata)" = "$BEFORE_REPLACED" ] || { echo 'FAIL: replaced function identity/ACL/defaults changed'; exit 1; }
echo 'PASS: upgrade after current baseline preserves data, request guard, starters and five replaced function identities/ACL/defaults'
for test in 91a_schedule_v2 91b_schedule_queue_integration 91c_extra_hours_reconcile 91d_pending_schedule_buffer; do
 "${Q[@]}" -f "$ROOT/supabase/tests/$test.test.sql"
done
[ "$(data_snapshot)" = "$BEFORE_DATA" ] || { echo 'FAIL: schedule regression leaked fixture changes'; exit 1; }
[ "$(protected_functions)" = "$BEFORE_PROTECTED" ] || { echo 'FAIL: schedule regressions changed protected functions'; exit 1; }
echo 'PASS: schedule upgrade matrix 91a-d rolls back all fixtures; revoked starter and guard preserved'
