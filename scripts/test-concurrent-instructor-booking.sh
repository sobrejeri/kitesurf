#!/usr/bin/env bash
# Two authenticated students race for the same sole instructor and meeting slot.
# Invoked only by scripts/test-db.sh against its disposable PostgreSQL instance.
set -euo pipefail
: "${PG_TEST_SOCKET:?Missing isolated PostgreSQL socket}"
: "${PG_TEST_PORT:?Missing isolated PostgreSQL port}"
PSQL=(psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq)
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

# Pick a future time outside the fixtures in 10_rules.test.sql.
slot="$("${PSQL[@]}" -c "select (date_trunc('day', now() + interval '40 days') + interval '12 hours')::timestamptz")"
beach="$("${PSQL[@]}" -c "select id from public.beaches where slug='jeri'")"
[[ "$slot" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2} ]] || { echo "Invalid isolated test timestamp" >&2; exit 1; }
[[ "$beach" =~ ^[0-9a-f-]{36}$ ]] || { echo "Missing isolated Jeri beach" >&2; exit 1; }

for entry in 'b1' 'b2'; do
  cat > "$scratch/$entry.sql" <<SQL
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000$entry', false);
select public.create_booking('$beach'::uuid, 'returning', 'Português',
  jsonb_build_array(jsonb_build_object('starts_at', '$slot', 'hours', 2)));
SQL
done

# Launch independent backend connections, not sequential calls in one session.
"${PSQL[@]}" -f "$scratch/b1.sql" > "$scratch/b1.out" 2> "$scratch/b1.err" &
pid1=$!
"${PSQL[@]}" -f "$scratch/b2.sql" > "$scratch/b2.out" 2> "$scratch/b2.err" &
pid2=$!
status1=0; wait "$pid1" || status1=$?
status2=0; wait "$pid2" || status2=$?
if ! { [[ "$status1" -eq 0 && "$status2" -ne 0 ]] || [[ "$status2" -eq 0 && "$status1" -ne 0 ]]; }; then
  echo "Expected exactly one accepted booking: student1=$status1 student2=$status2" >&2
  cat "$scratch/b1.err" "$scratch/b2.err" >&2
  exit 1
fi

# Verify persisted outcome rather than relying only on RPC exit codes.
count="$("${PSQL[@]}" -c "
select count(*) from public.booking_meetings m
join public.bookings b on b.id=m.booking_id
where b.beach_id='$beach'::uuid
  and b.instructor_id='00000000-0000-0000-0000-0000000000a1'::uuid
  and m.starts_at='$slot'::timestamptz
  and m.minutes=120;")"
if [[ "$count" != "1" ]]; then
  echo "Concurrency regression: expected exactly one persisted instructor meeting, got $count" >&2
  exit 1
fi
echo "PASS: two simultaneous authenticated bookings produced one accepted meeting"
