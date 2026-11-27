#!/usr/bin/env bash
# Only the disposable PostgreSQL cluster created by test-db.sh. No PSP calls.
set -euo pipefail
: "${PG_TEST_SOCKET:?Disposable socket required}"; : "${PG_TEST_PORT:?Disposable port required}"
[[ -f "$PG_TEST_SOCKET/PG_VERSION" ]] || { echo 'Disposable PostgreSQL data directory required' >&2; exit 1; }
query() { psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq "$@"; }
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
booking="$(query -c "select b.id from public.bookings b where not exists(select 1 from public.pagarme_test_attempts a where a.booking_id=b.id) limit 1")"
[[ "$booking" =~ ^[0-9a-f-]{36}$ ]] || { echo 'Booking fixture required' >&2; exit 1; }
before="$(query -c "select status from public.bookings where id='$booking'")"
insert="insert into public.pagarme_test_attempts(request_key,booking_id,student_id,method,amount_cents) select gen_random_uuid(),id,student_id,'pix',total_cents from public.bookings where id='$booking'"

# Release eight independent sessions together.
PGAPPNAME=pagarme-test-barrier query -c 'select pg_advisory_lock(3952701); select pg_sleep(3)' >"$out/barrier" &
barrier=$!
for i in $(seq 1 100); do
  [[ "$(query -c "select exists(select 1 from pg_stat_activity where application_name='pagarme-test-barrier' and wait_event='PgSleep')")" = t ]] && break
  [[ "$i" -lt 100 ]] || { echo 'Test barrier unavailable' >&2; exit 1; }
  sleep 0.05
done
for i in $(seq 1 8); do
  (
    if query -c 'select pg_advisory_lock_shared(3952701)' -c "$insert" >"$out/result$i" 2>"$out/error$i"; then
      echo ok >"$out/status$i"
    else
      case "$(cat "$out/error$i")" in *pagarme_test_one_unsettled_per_booking*) ;; *) cat "$out/error$i" >&2; exit 1 ;; esac
      echo duplicate >"$out/status$i"
    fi
  ) &
done
wait
accepted=0; rejected=0
for status in "$out"/status*; do
  case "$(cat "$status")" in ok) accepted=$((accepted+1)) ;; duplicate) rejected=$((rejected+1)) ;; *) exit 1 ;; esac
done
[[ "$accepted" -eq 1 && "$rejected" -eq 7 ]] || { echo 'Expected one acceptance and seven duplicate rejections' >&2; exit 1; }
query -c "update public.pagarme_test_attempts set status='unknown' where booking_id='$booking'" >/dev/null
if query -c "$insert" >"$out/retry" 2>"$out/retry-error"; then
  echo 'Unknown outcome incorrectly allowed retry' >&2; exit 1
fi
case "$(cat "$out/retry-error")" in *pagarme_test_one_unsettled_per_booking*) ;; *) cat "$out/retry-error" >&2; exit 1 ;; esac
[[ "$(query -c "select status from public.bookings where id='$booking'")" = "$before" ]] || { echo 'Test attempt changed booking' >&2; exit 1; }
query -c "delete from public.pagarme_test_attempts where booking_id='$booking'" >/dev/null
echo 'PASS: eight simultaneous test attempts produce one record; unknown outcome blocks retry; booking unchanged'
