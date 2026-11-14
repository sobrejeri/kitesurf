#!/usr/bin/env bash
# Two authenticated students race for the same sole instructor and meeting slot.
# Invoked only by scripts/test-db.sh against its disposable PostgreSQL instance.
set -euo pipefail
: "${PG_TEST_SOCKET:?Missing isolated PostgreSQL socket}"
: "${PG_TEST_PORT:?Missing isolated PostgreSQL port}"
PSQL=(psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq)
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

# Find an actually eligible slot using the same eligibility predicate as the RPC.
# Avoid hardcoded +N-day assumptions, weekly schedules, and prior fixtures.
beach="$("${PSQL[@]}" -c "select id from public.beaches where slug='jeri'")"
[[ "$beach" =~ ^[0-9a-f-]{36}$ ]] || { echo "Missing isolated Jeri beach" >&2; exit 1; }
slots="$("${PSQL[@]}" -c "
with slots as (
  select (date_trunc('day', now() at time zone 'America/Fortaleza')
    + make_interval(days=>d, hours=>h)) at time zone 'America/Fortaleza' as st
  from generate_series(2, 20) d cross join generate_series(8, 16) h
), eligible as (
  select st, (st at time zone 'America/Fortaleza')::date as local_day
  from slots
  where public.instructor_can_attend(
    '00000000-0000-0000-0000-0000000000a1'::uuid,
    jsonb_build_array(jsonb_build_object('starts_at',st,'hours',2)))
)
select a.st::text || '|' || b.st::text
from eligible a join eligible b on b.local_day>a.local_day
where public.instructor_can_attend(
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  jsonb_build_array(
    jsonb_build_object('starts_at',a.st,'hours',2),
    jsonb_build_object('starts_at',b.st,'hours',2)))
order by a.st,b.st limit 1")"
IFS='|' read -r slot slot2 <<< "$slots"
if [[ ! "$slot" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2} ]] || [[ ! "$slot2" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2} ]]; then
  echo "Fixture invalid: no eligible two-day pair for Rafael/Jeri" >&2
  exit 1
fi

for entry in 'b1' 'b2'; do
  cat > "$scratch/$entry.sql" <<SQL
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000$entry', false);
select public.create_booking('$beach'::uuid, 'first_time', 'Português',
  jsonb_build_array(jsonb_build_object('starts_at', '$slot', 'hours', 2),
    jsonb_build_object('starts_at', '$slot2', 'hours', 2)));
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
  and m.starts_at in ('$slot'::timestamptz, '$slot2'::timestamptz)
  and m.minutes=120;")"
if [[ "$count" != "2" ]]; then
  echo "Concurrency regression: expected exactly two meetings from one winning booking, got $count" >&2
  exit 1
fi
# A successful RPC alone is insufficient: assert one booking, the expected
# student owner, exactly 4 purchased hours, and both requested meeting dates.
# This also catches an orphaned/partial losing reservation after a race.
winning_student='b1'
if [[ "$status2" -eq 0 ]]; then winning_student='b2'; fi
persisted="$("${PSQL[@]}" -c "
select count(*)::text || '|' || coalesce(sum(b.total_hours),0)::text || '|' ||
  count(distinct m.starts_at)::text || '|' || count(distinct b.id)::text
from public.bookings b
join public.booking_meetings m on m.booking_id=b.id
where b.beach_id='$beach'::uuid
  and b.instructor_id='00000000-0000-0000-0000-0000000000a1'::uuid
  and b.student_id='00000000-0000-0000-0000-0000000000$winning_student'::uuid
  and m.starts_at in ('$slot'::timestamptz, '$slot2'::timestamptz);")"
# sum(total_hours) counts one booking per meeting (4+4=8).
if [[ "$persisted" != '2|8|2|1' ]]; then
  echo "Concurrency regression: invalid winning booking/meeting shape: $persisted" >&2
  exit 1
fi
losing_student='b2'
if [[ "$winning_student" == 'b2' ]]; then losing_student='b1'; fi
loser_bookings="$("${PSQL[@]}" -c "
select count(distinct b.id) from public.bookings b
join public.booking_meetings m on m.booking_id=b.id
where b.student_id='00000000-0000-0000-0000-0000000000$losing_student'::uuid
  and b.beach_id='$beach'::uuid
  and b.instructor_id='00000000-0000-0000-0000-0000000000a1'::uuid
  and m.starts_at in ('$slot'::timestamptz, '$slot2'::timestamptz);")"
if [[ "$loser_bookings" != '0' ]]; then
  echo "Concurrency regression: losing student retained $loser_bookings bookings" >&2
  exit 1
fi
echo "PASS: two simultaneous authenticated bookings produced one accepted two-day booking"
