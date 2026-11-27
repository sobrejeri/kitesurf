#!/usr/bin/env bash
# #93: upgrading an already-revoked starter, AFTER current main + request guard.
# Isolated fixture only. Does not use a remote DSN or apply hosted DDL.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
[ "$(id -u)" != 0 ] || { echo "Run as a non-root user." >&2; exit 1; }
D="$(mktemp -d)"; P="${PORT_INTERRUPTION_UPGRADE:-54670}"; H="$D"
trap '"$PG_BIN/pg_ctl" -D "$D" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
"$PG_BIN/initdb" -D "$D" -U postgres --auth=trust >/dev/null
if [ "${VENTO_TEST_TCP:-0}" = 1 ]; then
  H=127.0.0.1
  "$PG_BIN/pg_ctl" -D "$D" -o "-p $P -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -w start >/dev/null
else
  "$PG_BIN/pg_ctl" -D "$D" -o "-p $P -k $D -c listen_addresses=''" -w start >/dev/null
fi
Q=("$PG_BIN/psql" -h "$H" -p "$P" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -At)
M="$ROOT/supabase/migrations/20261121120000_meeting_interruption_resume.sql"
"${Q[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for m in "$ROOT"/supabase/migrations/*.sql; do
  [ "$m" = "$M" ] && continue
  "${Q[@]}" -f "$m" >/dev/null
done
"${Q[@]}" -f "$ROOT/supabase/tests/10_rules.test.sql" >/dev/null
# Add the managed project's privileged role only after the clean replay, and
# give both starters its observed EXECUTE. The feature must preserve that ACL.
"${Q[@]}" <<'SQL'
CREATE ROLE service_role NOLOGIN;
GRANT EXECUTE ON FUNCTION public.start_meeting(uuid,text),
 public.start_ordered_meeting(uuid,text) TO service_role;
DO $$ BEGIN
 ASSERT NOT has_function_privilege('authenticated','public.start_meeting(uuid,text)','EXECUTE'),
   'fixture requires direct starter already revoked';
 ASSERT has_function_privilege('authenticated','public.start_ordered_meeting(uuid,text)','EXECUTE'),
   'ordered starter must be available';
 ASSERT to_regprocedure('public.validate_booking_input(uuid,public.lesson_level,text,jsonb)') IS NOT NULL,
   'fixture requires the current request input guard';
END $$;
SQL
data_snapshot() {
  "${Q[@]}" <<'SQL'
SELECT md5(jsonb_build_array(
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.bookings t),
 (SELECT jsonb_agg(to_jsonb(t)-ARRAY[
   'planned_minutes','previous_done_minutes','interruption_state','interruption_reason',
   'interrupted_at','remaining_minutes','interruption_count','resume_scheduled_at'] ORDER BY id)
  FROM public.booking_meetings t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.audit_logs t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.app_notifications t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY meeting_id,step_number) FROM public.meeting_skill_progress t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.profiles t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.price_versions t)
)::text);
SQL
}
starter_metadata() {
  "${Q[@]}" <<'SQL'
SELECT md5(jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl,p.prosecdef,
 p.pronargdefaults,pg_get_expr(p.proargdefaults,0),p.proconfig,p.prolang,p.prorettype,p.proargtypes::text,p.proargnames)
 ORDER BY p.oid)::text)
FROM pg_proc p WHERE p.oid IN
 ('public.start_meeting(uuid,text)'::regprocedure,'public.start_ordered_meeting(uuid,text)'::regprocedure);
SQL
}
request_functions() {
  "${Q[@]}" <<'SQL'
SELECT md5(jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proowner,p.proacl) ORDER BY p.oid)::text)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('create_booking','create_instructor_request','create_instructor_request_with_preference','validate_booking_input');
SQL
}
before_data="$(data_snapshot)"; before_starters="$(starter_metadata)"; before_requests="$(request_functions)"
"${Q[@]}" -f "$M"
[ "$before_data" = "$(data_snapshot)" ] || { echo "FAIL: interruption upgrade changed existing rows"; exit 1; }
[ "$before_starters" = "$(starter_metadata)" ] || { echo "FAIL: starter ACL/owner/OID/signature drift"; exit 1; }
[ "$before_requests" = "$(request_functions)" ] || { echo "FAIL: request guard or booking RPC changed"; exit 1; }
"${Q[@]}" <<'SQL'
DO $$ BEGIN
 ASSERT NOT has_function_privilege('authenticated','public.start_meeting(uuid,text)','EXECUTE'),
   'P0: interruption upgrade reopened the direct starter';
 ASSERT NOT has_function_privilege('anon','public.start_meeting(uuid,text)','EXECUTE'),
   'P0: interruption upgrade exposed direct starter to anon/PUBLIC';
 ASSERT has_function_privilege('authenticated','public.start_ordered_meeting(uuid,text)','EXECUTE'),
   'ordered starter lost its authenticated grant';
 ASSERT has_function_privilege('service_role','public.start_meeting(uuid,text)','EXECUTE')
   AND has_function_privilege('service_role','public.start_ordered_meeting(uuid,text)','EXECUTE'),
   'privileged starter grants changed';
 ASSERT NOT EXISTS(SELECT 1 FROM public.booking_meetings
   WHERE interruption_count<>0 OR previous_done_minutes<>0 OR interruption_state IS NOT NULL),
   'historical meetings must start in neutral interruption state';
END $$;
SQL
"${Q[@]}" -f "$ROOT/supabase/tests/89l_meeting_interruption_resume.test.sql" >/dev/null
"${Q[@]}" -f "$ROOT/supabase/tests/89m_meeting_interruption_authorization.test.sql" >/dev/null
"${Q[@]}" -f "$ROOT/supabase/tests/89m_revoke_direct_start_meeting.test.sql" >/dev/null
[ "$before_data" = "$(data_snapshot)" ] || { echo "FAIL: interruption regressions left rows"; exit 1; }
[ "$before_starters" = "$(starter_metadata)" ] || { echo "FAIL: regression changed starter metadata"; exit 1; }
[ "$before_requests" = "$(request_functions)" ] || { echo "FAIL: regression changed request RPCs"; exit 1; }
echo "PASS: interruption upgrade after revoked starter and request guard; data/ACL/OID preserved; direct start closed; owner/duplicate/order/conflict regressions passed"
