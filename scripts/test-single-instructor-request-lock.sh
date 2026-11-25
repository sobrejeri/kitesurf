#!/usr/bin/env bash
# #92: com UM instrutor só, se a linha dele está travada por outra transação quando a solicitação nasce (advance_instructor_offer usa FOR UPDATE SKIP LOCKED),
# a solicitação é criada SEM oferta e sem esperar. Provas, por estado observado (pg_stat_activity), sem tempo decorrido:
#  1) a criação NÃO fica esperando lock (termina com a outra sessão ainda em PgSleep) e devolve o id; a solicitação fica 'searching' e sem oferta;
#  2) depois que o instrutor é liberado, atualizar a busca (refresh_instructor_request, o que o RequestPoller do aluno faz a cada 10 s) cria a oferta;
#  3) nenhuma duplicidade de oferta aberta e nenhum deadlock.
# Só roda no banco descartável do scripts/test-db.sh.
set -euo pipefail
: "${PG_TEST_SOCKET:?}"; : "${PG_TEST_PORT:?}"
PSQL=(psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq)
A1=00000000-0000-0000-0000-0000000000a1; B1=00000000-0000-0000-0000-0000000000b1
JERI="$("${PSQL[@]}" -c "select id from public.beaches where slug='jeri'")"
out="$(mktemp -d)"; trap 'rm -rf "$out"' EXIT
fail() { echo "FAIL $1" >&2; exit 1; }
as() { printf "begin; select set_config('request.jwt.claim.sub','%s',true); set local role authenticated; %s commit;" "$1" "$2"; }
S="$("${PSQL[@]}" -c "select (((now() at time zone 'America/Fortaleza')::date + 400 + time '10:00') at time zone 'America/Fortaleza')")"
dl0="$("${PSQL[@]}" -c "select deadlocks from pg_stat_database where datname='postgres'")"
# sessão 1: segura a linha do instrutor (como uma outra solicitação avançando, ou ele salvando a agenda)
( set +e; PGAPPNAME=lock-s1 "${PSQL[@]}" -c "begin; select id from public.instructors where id='$A1' for update; select pg_sleep(4); commit;" >"$out/s1.out" 2>"$out/s1.err"; echo $? >"$out/s1.rc" ) &
for i in $(seq 1 300); do [ "$("${PSQL[@]}" -c "select exists(select 1 from pg_stat_activity where application_name='lock-s1' and wait_event='PgSleep')")" = t ] && break; sleep 0.1; [ "$i" = 300 ] && fail "a sessão 1 não ficou segurando o instrutor"; done
REQ="$(PGAPPNAME=lock-s2 "${PSQL[@]}" -c "$(as $B1 "select public.create_instructor_request('$JERI','first_time','Português','[{\"starts_at\":\"$S\",\"hours\":1}]'::jsonb, null::text, false);")" | tail -1)"
[[ "$REQ" =~ ^[0-9a-f-]{36}$ ]] || fail "a criação não devolveu o id da solicitação: $REQ"
[ "$("${PSQL[@]}" -c "select exists(select 1 from pg_stat_activity where application_name='lock-s1' and wait_event='PgSleep')")" = t ] || fail "a criação só terminou depois do lock: ela ESPEROU o instrutor"
[ "$("${PSQL[@]}" -c "select status from public.instructor_requests where id='$REQ'")" = searching ] || fail "a solicitação deveria estar buscando"
[ "$("${PSQL[@]}" -c "select count(*) from public.instructor_offers where request_id='$REQ'")" = 0 ] || fail "não deveria haver oferta enquanto o instrutor está travado"
for i in $(seq 1 300); do [ -f "$out/s1.rc" ] && break; sleep 0.1; [ "$i" = 300 ] && fail "a sessão 1 não terminou"; done
[ "$(cat "$out/s1.rc")" = 0 ] || fail "sessão 1: $(cat "$out/s1.err")"
[ "$("${PSQL[@]}" -c "select count(*) from public.instructor_offers where request_id='$REQ'")" = 0 ] || fail "sem atualizar a busca ninguém cria a oferta (precisa do poller do aluno ou do worker)"
"${PSQL[@]}" -c "$(as $B1 "select public.refresh_instructor_request('$REQ');")" >/dev/null
[ "$("${PSQL[@]}" -c "select count(*) from public.instructor_offers where request_id='$REQ' and instructor_id='$A1' and status='offered'")" = 1 ] || fail "depois de liberado, atualizar a busca deveria criar a oferta"
"${PSQL[@]}" -c "$(as $B1 "select public.refresh_instructor_request('$REQ');")" >/dev/null
[ "$("${PSQL[@]}" -c "select count(*) from public.instructor_offers where request_id='$REQ' and status='offered'")" = 1 ] || fail "atualizar de novo não pode duplicar a oferta"
[ "$("${PSQL[@]}" -c "select deadlocks from pg_stat_database where datname='postgres'")" = "$dl0" ] || fail "deadlock"
"${PSQL[@]}" -c "update public.instructor_offers set status='declined' where request_id='$REQ'; update public.instructor_requests set status='cancelled' where id='$REQ'" >/dev/null
echo "PASS: um instrutor só travado: a solicitação nasce sem esperar e sem oferta; atualizar a busca (poller do aluno) cria a oferta, sem duplicar e sem deadlock"
