#!/usr/bin/env bash
# #91 Módulo 2 — corridas REAIS entre duas conexões (agenda do instrutor x reserva do aluno). Só roda no banco descartável do scripts/test-db.sh.
# Sincronização por ESTADO OBSERVADO no servidor (pg_stat_activity), nunca por tempo decorrido:
#   a sessão 1 abre uma transação, faz o trabalho e fica em pg_sleep (wait_event = PgSleep) segurando a linha do instrutor; só então a sessão 2 começa;
#   quando a sessão 2 deve ESPERAR, o teste exige ver wait_event_type = Lock nela; quando NÃO deve esperar, exige que ela termine com a sessão 1 ainda em PgSleep.
#  A) reserva em curso x bloqueio: o bloqueio espera (Lock) a reserva e depois é recusado ("reserva em pagamento"). Reserva e bloqueio nunca coexistem.
#  B) bloqueio em curso x reserva: a reserva não espera e não passa por cima (NO_INSTRUCTOR); nada é criado.
#  C) redução de turno em curso x reserva fora do novo turno: a reserva é recusada, nunca aceita no horário antigo.
#  D) redução de turno em curso x confirm_validation_lesson (trava só a reserva) de uma reserva em pagamento que deixou de caber: a confirmação ESPERA a reserva (Lock) e é
#     recusada, porque a reconciliação a cancelou; a reserva nunca é confirmada em horário que o instrutor acabou de fechar.
#  E) o mesmo com confirm_test_payment (trava o instrutor antes da reserva): espera o instrutor (Lock) e é recusada. Sem deadlock em nenhum dos dois caminhos.
# Ordem de locks: linha do instrutor primeiro. Nenhum deadlock (pg_stat_database.deadlocks não muda).
# ONLY=A|B|C roda um só cenário (usado pelo teste de mutação, que espera FALHA no A quando o lock é removido).
set -euo pipefail
: "${PG_TEST_SOCKET:?}"; : "${PG_TEST_PORT:?}"
PSQL=(psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq)
ONLY="${ONLY:-ABCDE}"
OFF="${OFFSET_BASE:-120}"   # dia inicial dos cenários (cada execução usa dias próprios: as reservas são confirmadas no banco descartável e não se repetem)
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
fail() { echo "FAIL $1" >&2; exit 1; }

bg() { # bg <nome> <sql>: roda em segundo plano com application_name = nome; grava .err e .rc
  local name="$1"; shift
  ( set +e; PGAPPNAME="$name" "${PSQL[@]}" -c "$*" >"$out/$name.out" 2>"$out/$name.err"; echo $? >"$out/$name.rc" ) &
}
wait_state() { # wait_state <descrição> <sql que devolve t>: espera até 30 s pelo estado observado
  local what="$1" cond="$2" i
  for i in $(seq 1 300); do [ "$("${PSQL[@]}" -c "$cond")" = t ] && return 0; sleep 0.1; done
  fail "estado não observado a tempo: $what"
}
sleeping() { echo "select exists(select 1 from pg_stat_activity where application_name='$1' and wait_event='PgSleep')"; }
blocked()  { echo "select exists(select 1 from pg_stat_activity where application_name='$1' and wait_event_type='Lock')"; }
finished() { [ -f "$out/$1.rc" ]; }
wait_rc() { local i; for i in $(seq 1 300); do finished "$1" && return 0; sleep 0.1; done; fail "$1 não terminou"; }
# a agenda ampla de a1 (todos os dias, 08-20, sem intervalo)
days='[{"weekday":0,"opens":"08:00","closes":"20:00"},{"weekday":1,"opens":"08:00","closes":"20:00"},{"weekday":2,"opens":"08:00","closes":"20:00"},{"weekday":3,"opens":"08:00","closes":"20:00"},{"weekday":4,"opens":"08:00","closes":"20:00"},{"weekday":5,"opens":"08:00","closes":"20:00"},{"weekday":6,"opens":"08:00","closes":"20:00"}]'
"${PSQL[@]}" -c "$(as $A1 "select public.save_my_weekly_schedule('$days'::jsonb, 0);")" >/dev/null

if [[ "$ONLY" == *A* ]]; then
  S="$(loc $OFF '10:00')"; E="$(loc $OFF '11:00')"
  bg conc-a1 "$(as $B1 "select public.create_booking('$JERI','first_time','Português','[{\"starts_at\":\"$S\",\"hours\":1}]'::jsonb); select pg_sleep(4);")"
  wait_state "A: reserva em curso segurando o instrutor" "$(sleeping conc-a1)"
  bg conc-a2 "$(as $A1 "select public.add_my_time_off('$S','$E','block','corrida-A-${OFF}');")"
  wait_state "A: o bloqueio ficou ESPERANDO por lock" "$(blocked conc-a2)"
  wait_rc conc-a1; wait_rc conc-a2
  [ "$(cat "$out/conc-a1.rc")" = 0 ] || fail "A: a reserva deveria ter sucesso: $(cat "$out/conc-a1.err")"
  grep -q "pending reservation" "$out/conc-a2.err" || fail "A: o bloqueio deveria ser recusado por reserva em pagamento: $(cat "$out/conc-a2.err")"
  [ "$("${PSQL[@]}" -c "select count(*) from public.instructor_time_off where instructor_id='$A1' and reason='corrida-A-${OFF}'")" = 0 ] || fail "A: bloqueio criado junto com a reserva"
  echo "PASS A: o bloqueio esperou (Lock observado) a reserva em curso e foi recusado; reserva e bloqueio nunca coexistem"
fi

if [[ "$ONLY" == *B* ]]; then
  S="$(loc $((OFF+1)) '10:00')"; E="$(loc $((OFF+1)) '11:00')"; n0="$("${PSQL[@]}" -c "select count(*) from public.bookings")"
  bg conc-b1 "$(as $A1 "select public.add_my_time_off('$S','$E','block','corrida-b'); select pg_sleep(4);")"
  wait_state "B: bloqueio em curso segurando o instrutor" "$(sleeping conc-b1)"
  bg conc-b2 "$(as $B1 "select public.create_booking('$JERI','first_time','Português','[{\"starts_at\":\"$S\",\"hours\":1}]'::jsonb);")"
  wait_rc conc-b2
  [ "$("${PSQL[@]}" -c "$(sleeping conc-b1)")" = t ] || fail "B: o bloqueio já tinha terminado (fixture sem sincronia)"
  grep -q "No instructor available" "$out/conc-b2.err" || fail "B: a reserva deveria dar NO_INSTRUCTOR sem esperar: $(cat "$out/conc-b2.err")"
  wait_rc conc-b1; [ "$(cat "$out/conc-b1.rc")" = 0 ] || fail "B: o bloqueio deveria ter sucesso: $(cat "$out/conc-b1.err")"
  [ "$("${PSQL[@]}" -c "select count(*) from public.bookings")" = "$n0" ] || fail "B: reserva criada sobre o bloqueio"
  [ "$("${PSQL[@]}" -c "select public.instructor_can_attend('$A1'::uuid, '[{\"starts_at\":\"$S\",\"hours\":1}]'::jsonb)")" = f ] || fail "B: o bloqueio não vale depois do commit"
  echo "PASS B: a reserva não esperou nem passou por cima do bloqueio em curso (NO_INSTRUCTOR) e nada foi criado"
fi

if [[ "$ONLY" == *C* ]]; then
  S="$(loc $((OFF+2)) '15:00')"; n0="$("${PSQL[@]}" -c "select count(*) from public.bookings")"
  wd="$("${PSQL[@]}" -c "select extract(dow from ((now() at time zone 'America/Fortaleza')::date + $((OFF+2))))::int")"
  short="$(echo "$days" | sed "s/{\"weekday\":$wd,\"opens\":\"08:00\",\"closes\":\"20:00\"}/{\"weekday\":$wd,\"opens\":\"08:00\",\"closes\":\"12:00\"}/")"
  [ "$short" != "$days" ] || fail "C: fixture não encurtou o turno"
  bg conc-c1 "$(as $A1 "select public.save_my_weekly_schedule('$short'::jsonb, 0); select pg_sleep(4);")"
  wait_state "C: redução de turno em curso" "$(sleeping conc-c1)"
  bg conc-c2 "$(as $B1 "select public.create_booking('$JERI','first_time','Português','[{\"starts_at\":\"$S\",\"hours\":1}]'::jsonb);")"
  wait_rc conc-c2
  [ "$("${PSQL[@]}" -c "$(sleeping conc-c1)")" = t ] || fail "C: a redução já tinha terminado (fixture sem sincronia)"
  grep -q "No instructor available" "$out/conc-c2.err" || fail "C: a reserva fora do novo turno deveria ser recusada: $(cat "$out/conc-c2.err")"
  wait_rc conc-c1; [ "$(cat "$out/conc-c1.rc")" = 0 ] || fail "C: salvar turno: $(cat "$out/conc-c1.err")"
  [ "$("${PSQL[@]}" -c "select count(*) from public.bookings")" = "$n0" ] || fail "C: reserva criada fora do turno"
  echo "PASS C: a reserva durante a redução do turno não foi aceita no horário antigo"
fi

hold_case() { # hold_case <letra> <dias> <função de confirmação> : D (confirm_validation_lesson) e E (confirm_test_payment)
  local letter="$1" off="$2" fn="$3" S wd short bk
  S="$(loc "$off" '10:00')"
  bk="$("${PSQL[@]}" -c "$(as $B1 "select public.create_booking('$JERI','first_time','Português','[{\"starts_at\":\"$S\",\"hours\":1}]'::jsonb);")" | tail -1)"
  [[ "$bk" =~ ^[0-9a-f-]{36}$ ]] || fail "$letter: não consegui criar a reserva em pagamento (fixture): $bk"
  [ "$("${PSQL[@]}" -c "select status from public.bookings where id='$bk'")" = awaiting_payment ] || fail "$letter: a reserva deveria estar em pagamento"
  wd="$("${PSQL[@]}" -c "select extract(dow from ((now() at time zone 'America/Fortaleza')::date + $off))::int")"
  short="$(echo "$days" | sed "s/{\"weekday\":$wd,\"opens\":\"08:00\",\"closes\":\"20:00\"}/{\"weekday\":$wd,\"opens\":\"08:00\",\"closes\":\"09:00\"}/")"
  [ "$short" != "$days" ] || fail "$letter: fixture não encurtou o turno"
  bg "conc-${letter}1" "$(as $A1 "select public.save_my_weekly_schedule('$short'::jsonb, 0); select pg_sleep(4);")"
  wait_state "$letter: redução de turno em curso" "$(sleeping conc-${letter}1)"
  bg "conc-${letter}2" "$(as $B1 "select public.$fn('$bk');")"
  wait_state "$letter: a confirmação ficou ESPERANDO por lock" "$(blocked conc-${letter}2)"
  wait_rc "conc-${letter}1"; wait_rc "conc-${letter}2"
  [ "$(cat "$out/conc-${letter}1.rc")" = 0 ] || fail "$letter: salvar turno: $(cat "$out/conc-${letter}1.err")"
  [ "$(cat "$out/conc-${letter}2.rc")" != 0 ] || fail "$letter: a confirmação deveria ser recusada (reserva cancelada pela reconciliação)"
  grep -q "55000\|unavailable or expired\|not awaiting payment" "$out/conc-${letter}2.err" || fail "$letter: recusa por motivo inesperado: $(cat "$out/conc-${letter}2.err")"
  [ "$("${PSQL[@]}" -c "select status from public.bookings where id='$bk'")" = cancelled ] || fail "$letter: a reserva deveria estar cancelada"
  [ "$("${PSQL[@]}" -c "select count(*) from public.audit_logs where action='booking.hold_cancelled_availability' and entity_id='$bk'")" = 1 ] || fail "$letter: cancelamento sem auditoria"
  "${PSQL[@]}" -c "$(as $A1 "select public.save_my_weekly_schedule('$days'::jsonb, 0);")" >/dev/null
  echo "PASS $letter: a confirmação esperou (Lock observado) e foi recusada; a reserva em pagamento que não cabia mais ficou cancelada e auditada"
}
if [[ "$ONLY" == *D* ]]; then hold_case D $((OFF+3)) confirm_validation_lesson; fi
if [[ "$ONLY" == *E* ]]; then hold_case E $((OFF+4)) confirm_test_payment; fi

[ "$(deadlocks)" = "$dl0" ] || fail "deadlock detectado"
if grep -qi "deadlock" "$out"/*.err 2>/dev/null; then fail "deadlock nas conexões"; fi
"${PSQL[@]}" -c "$(as $A1 "select public.save_my_weekly_schedule('$days'::jsonb, 0);")" >/dev/null
echo "PASS: agenda x reserva sob concorrência real (${ONLY}), sincronizada por estado observado, sem deadlock"
