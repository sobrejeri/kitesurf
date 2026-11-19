#!/usr/bin/env bash
# Invoked by test-db.sh against its disposable PostgreSQL instance only.
set -euo pipefail
: "${PG_TEST_SOCKET:?}" "${PG_TEST_PORT:?}"
export PGOPTIONS='-c statement_timeout=10000'
psql_cmd=(psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq)
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

student='00000000-0000-0000-0000-0000000000b1'
jeri_instructor='00000000-0000-0000-0000-0000000000a1'
guriu_instructor='00000000-0000-0000-0000-0000000000a2'
fixture="$("${psql_cmd[@]}" -v student="$student" -v jeri_instructor="$jeri_instructor" -v guriu_instructor="$guriu_instructor" <<'SQL'
-- 10_rules creates Guriú for Marina, then deactivates it.
update public.beaches set active = true where slug = 'praia-do-guriu';
with candidate_slots as (
  select (date_trunc('day', now() at time zone 'America/Fortaleza')
    + make_interval(days => day_num, hours => hour_num)) at time zone 'America/Fortaleza' as starts_at
  from generate_series(5, 60) day_num cross join generate_series(8, 14) hour_num
)
select jeri.id, guriu.id, s.starts_at, s.starts_at + interval '1 hour'
from candidate_slots s
cross join public.beaches jeri
cross join public.beaches guriu
where jeri.slug = 'jeri' and guriu.slug = 'praia-do-guriu'
  and public.instructor_can_attend(:'jeri_instructor', jsonb_build_array(
    jsonb_build_object('starts_at', s.starts_at, 'hours', 2)))
  and public.instructor_can_attend(:'guriu_instructor', jsonb_build_array(
    jsonb_build_object('starts_at', s.starts_at + interval '1 hour', 'hours', 2)))
  and not exists (
    select 1 from public.booking_meetings m join public.bookings b on b.id = m.booking_id
    where b.student_id = :'student' and m.status <> 'cancelled'
      and (b.status = 'confirmed' or
        (b.status = 'awaiting_payment' and b.created_at >= now() - interval '10 minutes'))
      and tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.minutes), '[)')
        && tstzrange(s.starts_at, s.starts_at + interval '3 hours', '[)')
  )
order by s.starts_at
limit 1;
SQL
)"
IFS='|' read -r jeri guriu first_start second_start <<< "$fixture"
if [[ -z "$jeri" || -z "$guriu" || -z "$first_start" || -z "$second_start" ]]; then
  echo "Fixture invalid: no overlapping availability for the two instructors" >&2
  exit 1
fi

book() {
  "${psql_cmd[@]}" -v student="$student" -v beach="$1" -v starts_at="$2" <<'SQL'
\set VERBOSITY verbose
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'student', true);
select public.create_booking(:'beach', 'first_time', 'Português',
  jsonb_build_array(jsonb_build_object('starts_at', :'starts_at', 'hours', 2)));
select pg_sleep(0.3);
commit;
SQL
}

book "$jeri" "$first_start" > "$scratch/jeri.out" 2> "$scratch/jeri.err" &
jeri_pid=$!
book "$guriu" "$second_start" > "$scratch/guriu.out" 2> "$scratch/guriu.err" &
guriu_pid=$!
jeri_status=0
guriu_status=0
wait "$jeri_pid" || jeri_status=$?
wait "$guriu_pid" || guriu_status=$?

if [[ "$jeri_status" == 0 && "$guriu_status" != 0 ]]; then
  rejected="$scratch/guriu.err"
  winner="$jeri_instructor"
elif [[ "$guriu_status" == 0 && "$jeri_status" != 0 ]]; then
  rejected="$scratch/jeri.err"
  winner="$guriu_instructor"
else
  echo "Expected one booking for the student, Jeri=$jeri_status Guriú=$guriu_status" >&2
  cat "$scratch/jeri.err" "$scratch/guriu.err" >&2
  exit 1
fi
if ! grep -q '23P01: Student already has a meeting' "$rejected"; then
  cat "$rejected" >&2
  exit 1
fi

persisted="$("${psql_cmd[@]}" -v student="$student" -v jeri="$jeri" -v guriu="$guriu" \
  -v first_start="$first_start" -v second_start="$second_start" -v winner="$winner" <<'SQL'
select count(distinct b.id), count(m.id), count(m.id) filter (where b.instructor_id = :'winner' and m.minutes = 120)
from public.bookings b left join public.booking_meetings m on m.booking_id = b.id
where b.student_id = :'student' and b.beach_id in (:'jeri', :'guriu')
  and b.status = 'awaiting_payment'
  and (m.starts_at in (:'first_start', :'second_start') or m.id is null);
SQL
)"
if [[ "$persisted" != '1|1|1' ]]; then
  echo "Student booking race left an incorrect booking or meeting: $persisted" >&2
  exit 1
fi
echo 'PASS: overlapping requests for one student with different instructors produced one valid booking'
