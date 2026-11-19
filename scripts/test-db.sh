#!/usr/bin/env bash
# Applies the Supabase migrations to a throwaway local PostgreSQL and runs the
# rule tests in supabase/tests. Needs PostgreSQL 15+ binaries on the machine;
# touches nothing outside a temporary directory.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
DATA="$(mktemp -d)"
PORT="${PORT:-54329}"
trap '"$PG_BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT

if [ "$(id -u)" = "0" ]; then
  echo "Run as a non-root user (PostgreSQL refuses to start as root)." >&2
  exit 1
fi

"$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -w start >/dev/null

PSQL=(psql -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for migration in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -1 -f "$migration"
done
"${PSQL[@]}" -f "$ROOT/supabase/tests/10_rules.test.sql"
# Run overlap regression while the two-meeting fixture from 10_rules is intact.
# Later stateful SQL tests may cancel or reschedule that booking.
"${PSQL[@]}" -f "$ROOT/supabase/tests/89a_student_overlap_behavior.test.sql"
for testfile in "$ROOT"/supabase/tests/[2-9]*.test.sql; do
  [ "$testfile" = "$ROOT/supabase/tests/89a_student_overlap_behavior.test.sql" ] && continue
  "${PSQL[@]}" -f "$testfile"
done

# Run actual two-connection race only in this disposable database, after rule fixtures.
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-concurrent-instructor-booking.sh"

# Validate the core student flow: four scheduled hours split across two days.
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-booking-two-meetings.sh"

# Cover the student-facing request/offer path through both lessons and balance.
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-request-queue-two-meetings.sh"
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" PG_TEST_REQUEST_MODE=preferred bash "$ROOT/scripts/test-request-queue-two-meetings.sh"

# A declines, B expires, C accepts in the same disposable database.
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-offer-queue-abc.sh"

# Authorized postponement and cross-account denial in throwaway PostgreSQL.
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-meeting-change-auth.sh"

# The booking race is timing dependent: a single run catches a regression only some of the time.
# Run it again, many times, at the very end (each round books the next free pair of days for the
# same instructor with two simultaneous connections, so it must not run before the other flows
# that look for free days).
for round in $(seq 1 "${RACE_ROUNDS:-12}"); do
  PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-concurrent-instructor-booking.sh" >/dev/null 2>"$DATA/race.err" \
    || { echo "Concurrent booking race failed on round $round" >&2; cat "$DATA/race.err" >&2; exit 1; }
done
echo "PASS: ${RACE_ROUNDS:-12} repeated concurrent booking rounds, never two accepted bookings for one instructor and slot"
