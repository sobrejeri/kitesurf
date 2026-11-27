#!/usr/bin/env bash
# Disposal-only: reproduce logout/subscription lock inversion and deferred cleanup.
set -euo pipefail
: "$PG_TEST_SOCKET"; : "$PG_TEST_PORT"
query() { psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq "$@"; }
for mode in renew logout; do
  if [ "$mode" = renew ];then sid=96777777-7777-4777-8777-777777777777;else sid=96888888-8888-4888-8888-888888888888;fi
  query -c "
  insert into auth.sessions(id,user_id) values('$sid','00000000-0000-0000-0000-0000000000b2');
  insert into public.push_subscriptions(owner_id,session_id,endpoint,p256dh,auth_secret,updated_at)
  values('00000000-0000-0000-0000-0000000000b2','$sid','https://fcm.googleapis.com/fcm/send/retire-$mode',
   rtrim(translate(replace(encode(decode('04'||repeat('00',64),'hex'),'base64'),E'\n',''),'+/','-_'),'='),
   rtrim(translate(encode(decode(repeat('00',16),'hex'),'base64'),'+/','-_'),'='),now()-interval '1 minute');
  update public.push_dispatch_settings set enabled=true,activated_at=now()-interval '1 second',rate_claims=0 where singleton;
  update public.push_subscription_settings set enabled=true where singleton;
  update public.push_dispatch_recipient_rates set rate_window=now()-interval '2 minutes';
  insert into public.app_notifications(recipient_id,category,title,href)
  values('00000000-0000-0000-0000-0000000000b2','booking','retirement fixture','/aluno/avisos');
  " >/dev/null
  cutoff="$(query -c 'select activated_at from public.push_dispatch_settings where singleton')"
  query -c "set role vento_push_dispatcher;select public.claim_push_dispatch('$cutoff'::timestamptz)" >/dev/null
  job="$(query -c "select q.id from public.push_outbox q join public.push_subscriptions s on s.id=q.subscription_id where s.endpoint='https://fcm.googleapis.com/fcm/send/retire-$mode'")"
  lease="$(query -c "select lease_token from public.push_outbox where id='$job'")"
  query -c "set role vento_push_dispatcher;select public.prepare_push_dispatch('$job','$lease','$cutoff')" >/dev/null
  if [ "$mode" = logout ];then mutation="delete from auth.sessions where id='$sid';";else mutation="";fi
  PGAPPNAME="push-retire-$mode" query -c "begin;select id from public.push_subscriptions where session_id='$sid' for update;select pg_sleep(3);$mutation commit;" >/dev/null &
  holder=$!
  for i in $(seq 1 100);do
    [ "$(query -c "select exists(select 1 from pg_stat_activity where application_name='push-retire-$mode' and wait_event='PgSleep')")" = t ]&&break
    [ "$i" -lt 100 ]||{ echo 'retirement barrier unavailable' >&2;exit 1; }
    sleep 0.05
  done
  # Must finish while the subscription holder is still active, not wait for it.
  result="$(query -c "set statement_timeout='2s';set role vento_push_dispatcher;select public.settle_push_dispatch('$job','$lease','gone',410,0)")"
  [ "$result" = dead ]||{ echo 'gone settlement failed' >&2;exit 1; }
  [ "$(query -c "select exists(select 1 from pg_stat_activity where application_name='push-retire-$mode' and wait_event='PgSleep')")" = t ]||{ echo 'settlement waited on subscription' >&2;exit 1; }
  wait "$holder"
  if [ "$mode" = logout ];then
    [ "$(query -c "select count(*) from public.push_outbox where id='$job'")" = 0 ]||{ echo 'Auth cascade did not complete' >&2;exit 1; }
    [ "$(query -c "select count(*) from auth.sessions where id='$sid'")" = 0 ]||{ echo 'Auth session was not deleted' >&2;exit 1; }
  else
    query -c "set role vento_push_dispatcher;select public.claim_push_dispatch('$cutoff')" >/dev/null
    [ "$(query -c "select revoked_at is not null and p256dh is null and auth_secret is null from public.push_subscriptions where session_id='$sid'")" = t ]||{ echo 'deferred retirement failed' >&2;exit 1; }
  fi
done
query -c 'update public.push_dispatch_settings set enabled=false where singleton;update public.push_subscription_settings set enabled=false where singleton' >/dev/null
echo 'PASS: gone settlement never waits on subscription/Auth logout; deferred cleanup erases same-version keys'
