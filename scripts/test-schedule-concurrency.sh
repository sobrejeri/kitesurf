#!/usr/bin/env bash
# #91 Módulo 2 — corridas REAIS entre duas conexões (agenda do instrutor x reserva do aluno). Só roda no banco descartável do scripts/test-db.sh.
#  A) uma reserva em curso (transação aberta) e, ao mesmo tempo, o instrutor tenta bloquear o horário: o bloqueio ESPERA a transação da reserva
#     (mesmo lock da linha do instrutor) e depois é recusado ("reserva em pagamento"). Nunca existem a reserva e o bloqueio juntos.
#  B) o instrutor bloqueia (transação aberta) e, ao mesmo tempo, o aluno reserva: a reserva não espera nem passa por cima (NO_INSTRUCTOR) e nada é criado.
#  C) o instrutor reduz o turno (transação aberta) e o aluno reserva fora do novo turno: a reserva é recusada depois do commit, nunca aceita no horário velho.
# Ordem de locks: linha do instrutor primeiro. Nenhum deadlock (pg_stat_database.deadlocks não muda).
set -euo pipefail
: "${PG_TEST_SOCKET:?}"; : "${PG_TEST_PORT:?}"
PSQL=(psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq)
A1=00000000-0000-0000-0000-0000000000a1; B1=00000000-0000-0000-0000-0000000000b1
JERI="$("${PSQL[@]}" -c "select id from public.beaches where slug='jeri'")"
out="$(mktemp -d)"; trap 'rm -rf "$out"' EXIT
deadlocks() { "${PSQL[@]}" -c "select deadlocks from pg_stat_database where datname='postgres'"; }
dl0="$(deadlocks)"
as() { # as <uid> <sql...>: uma transação como esse usuário autenticado
  local uid="$1"; shift
  printf "begin; select set_config('request.jwt.claim.sub','%s',true); set local role authenticated; %s commit;" "$uid" "$*"
}
loc() { "${PSQL[@]}" -c "select (((now() at time zone 'America/Fortaleza')::date + $1 + time '$2') at time zone 'America/Fortaleza')"; }

# a1 atende todos os dias 08-20, sem intervalo
days='[{"weekday":0,"opens":"08:00","closes":"20:00"},{"weekday":1,"opens":"08:00","closes":"20:00"},{"weekday":2,"opens":"08:00","closes":"20:00"},{"weekday":3,"opens":"08:00","closes":"20:00"},{"weekday":4,"opens":"08:00","closes":"20:00"},{"weekday":5,"opens":"08:00","closes":"20:00"},{"weekday":6,"opens":"08:00","closes":"20:00"}]'
"${PSQL[@]}" -c "$(as $A1 "select public.save_my_weekly_schedule('$days'::jsonb, 0);")" >/dev/null

run() { # run <arquivo> <sql>  -> grava saída e tempo
  local f="$1"; shift; local t0=$(date +%s.%N)
  "${PSQL[@]}" -c "$*" >"$f.out" 2>"$f.err" && echo ok >"$f.rc" || echo err >"$f.rc"
  echo "$(echo "$(date +%s.%N) - $t0" | bc)" >"$f.sec"
}

# ---- A) reserva em curso x bloqueio ----
S1="$(loc 120 '10:00')"; E1="$(loc 120 '11:00')"
run "$out/a1" "$(as $B1 "select public.create_booking('$JERI','first_time','Português','[{\"starts_at\":\"$S1\",\"hours\":1}]'::jsonb); select pg_sleep(3);")" &
sleep 1
run "$out/a2" "$(as $A1 "select public.add_my_time_off('$S1','$E1','block','corrida');")"
wait
[ "$(cat "$out/a1.rc")" = ok ] || { echo "FAIL A: a reserva deveria ter sucesso: $(cat "$out/a1.err")"; exit 1; }
grep -q "pending reservation" "$out/a2.err" || { echo "FAIL A: o bloqueio deveria ser recusado por reserva em pagamento: $(cat "$out/a2.err")"; exit 1; }
awk -v s="$(cat "$out/a2.sec")" 'BEGIN{exit !(s>=1.5)}' || { echo "FAIL A: o bloqueio não esperou a reserva (serialização): $(cat "$out/a2.sec")s"; exit 1; }
[ "$("${PSQL[@]}" -c "select count(*) from public.instructor_time_off where instructor_id='$A1' and reason='corrida'")" = 0 ] || { echo "FAIL A: bloqueio criado junto com a reserva"; exit 1; }
echo "PASS A: bloqueio esperou a reserva em curso e foi recusado; reserva e bloqueio nunca coexistem"

# ---- B) bloqueio em curso x reserva ----
S2="$(loc 121 '10:00')"; E2="$(loc 121 '11:00')"
n0="$("${PSQL[@]}" -c "select count(*) from public.bookings")"
run "$out/b1" "$(as $A1 "select public.add_my_time_off('$S2','$E2','block','corrida-b'); select pg_sleep(3);")" &
sleep 1
run "$out/b2" "$(as $B1 "select public.create_booking('$JERI','first_time','Português','[{\"starts_at\":\"$S2\",\"hours\":1}]'::jsonb);")"
wait
[ "$(cat "$out/b1.rc")" = ok ] || { echo "FAIL B: o bloqueio deveria ter sucesso: $(cat "$out/b1.err")"; exit 1; }
grep -q "No instructor available" "$out/b2.err" || { echo "FAIL B: a reserva deveria dar NO_INSTRUCTOR: $(cat "$out/b2.err")"; exit 1; }
[ "$("${PSQL[@]}" -c "select count(*) from public.bookings")" = "$n0" ] || { echo "FAIL B: reserva criada sobre o bloqueio"; exit 1; }
echo "PASS B: reserva não passa por cima do bloqueio em curso (NO_INSTRUCTOR) e nada é criado"
# depois do commit o bloqueio vale
t="$("${PSQL[@]}" -c "select public.instructor_can_attend('$A1'::uuid, '[{\"starts_at\":\"$S2\",\"hours\":1}]'::jsonb)")"; [ "$t" = f ] || { echo "FAIL B: bloqueio não vale"; exit 1; }

# ---- C) redução de turno em curso x reserva fora do novo turno ----
S3="$(loc 122 '15:00')"
wd="$("${PSQL[@]}" -c "select extract(dow from ((now() at time zone 'America/Fortaleza')::date + 122))::int")"
short="$(echo "$days" | sed "s/{\"weekday\":$wd,\"opens\":\"08:00\",\"closes\":\"20:00\"}/{\"weekday\":$wd,\"opens\":\"08:00\",\"closes\":\"12:00\"}/")"
n0="$("${PSQL[@]}" -c "select count(*) from public.bookings")"
run "$out/c1" "$(as $A1 "select public.save_my_weekly_schedule('$short'::jsonb, 0); select pg_sleep(3);")" &
sleep 1
run "$out/c2" "$(as $B1 "select public.create_booking('$JERI','first_time','Português','[{\"starts_at\":\"$S3\",\"hours\":1}]'::jsonb);")"
wait
[ "$(cat "$out/c1.rc")" = ok ] || { echo "FAIL C: salvar turno: $(cat "$out/c1.err")"; exit 1; }
grep -q "No instructor available" "$out/c2.err" || { echo "FAIL C: a reserva fora do novo turno deveria ser recusada: $(cat "$out/c2.err")"; exit 1; }
[ "$("${PSQL[@]}" -c "select count(*) from public.bookings")" = "$n0" ] || { echo "FAIL C: reserva criada fora do turno"; exit 1; }
echo "PASS C: reserva durante a redução do turno não é aceita no horário antigo"

[ "$(deadlocks)" = "$dl0" ] || { echo "FAIL: deadlock detectado"; exit 1; }
grep -qi "deadlock" "$out"/*.err 2>/dev/null && { echo "FAIL: deadlock nas conexões"; exit 1; }
# devolve a agenda ampla de a1 para os testes seguintes
"${PSQL[@]}" -c "$(as $A1 "select public.save_my_weekly_schedule('$days'::jsonb, 0);")" >/dev/null
echo "PASS: agenda x reserva sob concorrência real (A, B, C), sem deadlock"
