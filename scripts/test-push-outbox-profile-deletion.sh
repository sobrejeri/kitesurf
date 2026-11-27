#!/usr/bin/env bash
# Disposable-only: a claim must not wait on profile FK locks held by deletion.
set -euo pipefail
: "$PG_TEST_SOCKET"; : "$PG_TEST_PORT"
query() { psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq "$@"; }
for mode in profile user;do
  if [ "$mode" = profile ];then actor=96aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa;sid=96bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb
  else actor=96cccccc-cccc-4ccc-8ccc-cccccccccccc;sid=96dddddd-dddd-4ddd-8ddd-dddddddddddd;fi
  query -c "
  insert into auth.users(id,email,raw_user_meta_data)values('$actor','push-delete-$mode@synthetic.invalid','{\"full_name\":\"Synthetic deletion fixture\"}');
  insert into auth.sessions(id,user_id)values('$sid','$actor');
  insert into public.push_subscriptions(owner_id,session_id,endpoint,p256dh,auth_secret,updated_at)
  values('$actor','$sid','https://fcm.googleapis.com/fcm/send/delete-$mode',
   rtrim(translate(replace(encode(decode('04'||repeat('00',64),'hex'),'base64'),E'\n',''),'+/','-_'),'='),
   rtrim(translate(encode(decode(repeat('00',16),'hex'),'base64'),'+/','-_'),'='),now()-interval '1 minute');
  update public.push_dispatch_settings set enabled=true,activated_at=now()-interval '1 second',rate_claims=0 where singleton;
  update public.push_subscription_settings set enabled=true where singleton;
  insert into public.app_notifications(recipient_id,category,title,href)
  values('$actor','booking','parent deletion fixture','/aluno/avisos');
  " >/dev/null
  cutoff="$(query -c 'select activated_at from public.push_dispatch_settings where singleton')"
  if [ "$mode" = profile ];then mutation="delete from public.profiles where id='$actor';"
  else mutation="delete from auth.users where id='$actor';";fi
  PGAPPNAME="push-delete-$mode" query -c "begin;select id from public.profiles where id='$actor' for update;select pg_sleep(3);$mutation commit;" >/dev/null &
  holder=$!
  for i in $(seq 1 100);do
    [ "$(query -c "select exists(select 1 from pg_stat_activity where application_name='push-delete-$mode' and wait_event='PgSleep')")" = t ]&&break
    [ "$i" -lt 100 ]||{ echo 'profile deletion barrier unavailable' >&2;exit 1; }
    sleep 0.05
  done
  result="$(query -c "set statement_timeout='2s';set role vento_push_dispatcher;select public.claim_push_dispatch('$cutoff')")"
  [ -z "$result" ]||{ echo 'claim should skip deleting profile' >&2;exit 1; }
  [ "$(query -c "select exists(select 1 from pg_stat_activity where application_name='push-delete-$mode' and wait_event='PgSleep')")" = t ]||{ echo 'claim waited on deleting profile' >&2;exit 1; }
  wait "$holder"
  [ "$(query -c "select count(*) from public.profiles where id='$actor'")" = 0 ]||{ echo 'profile deletion failed' >&2;exit 1; }
  [ "$(query -c "select count(*) from public.push_outbox where recipient_id='$actor'")" = 0 ]||{ echo 'outbox cascade failed' >&2;exit 1; }
  if [ "$mode" = user ];then
    [ "$(query -c "select count(*) from auth.users where id='$actor'")" = 0 ]||{ echo 'Auth user deletion failed' >&2;exit 1; }
    [ "$(query -c "select count(*) from auth.sessions where id='$sid'")" = 0 ]||{ echo 'Auth session cascade failed' >&2;exit 1; }
  fi
done
query -c 'update public.push_dispatch_settings set enabled=false where singleton;update public.push_subscription_settings set enabled=false where singleton' >/dev/null
echo 'PASS: claim skips parent profile locks; synthetic profile and Auth user deletion complete without lock inversion'
