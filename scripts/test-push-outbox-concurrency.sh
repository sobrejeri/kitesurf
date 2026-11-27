#!/usr/bin/env bash
# Runs ONLY in the throwaway test-db cluster; no network push is performed.
set -euo pipefail
: "$PG_TEST_SOCKET"; : "$PG_TEST_PORT"
umask 077
query() { psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq "$@"; }
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
query <<'SQL'
insert into auth.sessions(id,user_id) values('96999999-9999-4999-8999-999999999999','00000000-0000-0000-0000-0000000000b1');
insert into public.push_subscriptions(owner_id,session_id,endpoint,p256dh,auth_secret,updated_at)
 values('00000000-0000-0000-0000-0000000000b1','96999999-9999-4999-8999-999999999999',
 'https://fcm.googleapis.com/fcm/send/concurrency-synthetic',
 rtrim(translate(replace(encode(decode('04'||repeat('00',64),'hex'),'base64'),E'\n',''),'+/','-_'),'='),
 rtrim(translate(encode(decode(repeat('00',16),'hex'),'base64'),'+/','-_'),'='),now()-interval '1 minute');
update public.push_dispatch_settings set enabled=true,activated_at=now()-interval '1 second',rate_claims=0,rate_window=now() where singleton;
update public.push_subscription_settings set enabled=true where singleton;
insert into public.app_notifications(recipient_id,category,title,href)
 values('00000000-0000-0000-0000-0000000000b1','booking','Concurrency fixture','/aluno/avisos');
SQL
cutoff="$(query -c 'select activated_at from public.push_dispatch_settings where singleton')"
# A barrier holds the shared budget row while both workers are launched.
PGAPPNAME=push-race-barrier query -c "begin;select singleton from public.push_dispatch_settings for update;select pg_sleep(3);commit" >"$out/barrier" &
barrier=$!
for i in $(seq 1 100); do
  [ "$(query -c "select exists(select 1 from pg_stat_activity where application_name='push-race-barrier' and wait_event='PgSleep')")" = t ] && break
  [ "$i" -lt 100 ] || { echo 'push race barrier unavailable' >&2;exit 1; }
  sleep 0.05
done
query -c "set role vento_push_dispatcher;select public.claim_push_dispatch('$cutoff'::timestamptz)" >"$out/claim1" &
claim1=$!
query -c "set role vento_push_dispatcher;select public.claim_push_dispatch('$cutoff'::timestamptz)" >"$out/claim2" &
claim2=$!
wait "$claim1"
wait "$claim2"
wait "$barrier"
a="$(cat "$out/claim1")"; b="$(cat "$out/claim2")"
if { [ -n "$a" ] && [ -n "$b" ]; } || { [ -z "$a" ] && [ -z "$b" ]; }; then
  echo 'expected exactly one concurrent lease' >&2;exit 1
fi
job="$(query -c "select id from public.push_outbox where status='leased'")"
lease="$(query -c "select lease_token from public.push_outbox where id='$job'")"
for n in 1 2; do
  (
    set +e
    query -c "set role vento_push_dispatcher;select public.prepare_push_dispatch('$job'::uuid,'$lease'::uuid,'$cutoff'::timestamptz)" >"$out/prepare$n" 2>"$out/error$n"
    echo $? >"$out/rc$n"
  ) &
done
wait
a="$(cat "$out/rc1")"; b="$(cat "$out/rc2")"
if { [ "$a" = 0 ] && [ "$b" = 0 ]; } || { [ "$a" != 0 ] && [ "$b" != 0 ]; }; then
  echo 'expected exactly one concurrent prepared attempt' >&2;exit 1
fi
[ "$(query -c "select attempts from public.push_outbox where id='$job'")" = 1 ] || { echo 'duplicate prepared attempt' >&2;exit 1; }
query -c 'update public.push_dispatch_settings set enabled=false where singleton;update public.push_subscription_settings set enabled=false where singleton' >/dev/null
echo 'PASS: two concurrent worker connections produce exactly one lease and one prepared attempt'
