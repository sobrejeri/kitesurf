#!/usr/bin/env bash
# Focused fingerprint regression; creates its own disposable Unix-only cluster.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
[[ "$(id -u)" != 0 ]] || { echo 'Run as a non-root user' >&2; exit 1; }
DATA="$(mktemp -d)"; PORT="${PORT:-54811}"
trap '"$PG_BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT
"$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -w start >/dev/null
Q=("$PG_BIN/psql" -X -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq)
fingerprint() { "${Q[@]}" -f "$ROOT/scripts/ops/90-booking-fingerprint.sql"; }
"${Q[@]}" <<'SQL'
create table public.bookings(id integer primary key, payload jsonb not null);
create table public.booking_meetings(id integer primary key, payload jsonb not null);
insert into public.bookings values (2, '{"status":"confirmed"}'), (1, '{"status":"pending"}');
insert into public.booking_meetings values (2, '{"minutes":120}'), (1, '{"minutes":60}');
SQL
before="$(fingerprint)"
[[ "$(fingerprint)" = "$before" ]] || { echo 'Unchanged rows did not match' >&2; exit 1; }
"${Q[@]}" -c "update public.bookings set payload='{}' where id=1"
[[ "$(fingerprint)" != "$before" ]] || { echo 'Same-count booking mutation was missed' >&2; exit 1; }
"${Q[@]}" -c "update public.bookings set payload=jsonb_build_object('status','pending') where id=1"
[[ "$(fingerprint)" = "$before" ]] || { echo 'Restored booking did not match' >&2; exit 1; }
"${Q[@]}" -c "update public.booking_meetings set payload='{}' where id=1"
[[ "$(fingerprint)" != "$before" ]] || { echo 'Same-count meeting mutation was missed' >&2; exit 1; }
"${Q[@]}" -c "update public.booking_meetings set payload=jsonb_build_object('minutes',60) where id=1"
"${Q[@]}" -c "delete from public.bookings where id=2"
[[ "$(fingerprint)" != "$before" ]] || { echo 'Booking deletion was missed' >&2; exit 1; }
"${Q[@]}" -c "insert into public.bookings values (2,jsonb_build_object('status','confirmed'))"
[[ "$(fingerprint)" = "$before" ]] || { echo 'Reordered equivalent rows did not match' >&2; exit 1; }
echo 'PASS: complete booking/meeting fingerprints detect same-count mutations and deletions; equivalent rows match'
