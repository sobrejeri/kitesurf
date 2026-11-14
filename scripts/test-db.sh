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
for testfile in "$ROOT"/supabase/tests/[2-9]*.test.sql; do
  "${PSQL[@]}" -f "$testfile"
done

# Run actual two-connection race only in this disposable database, after rule fixtures.
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-concurrent-instructor-booking.sh"

# Validate the core student flow: four scheduled hours split across two days.
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-booking-two-meetings.sh"

# A declines, B expires, C accepts in the same disposable database.
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-offer-queue-abc.sh"
