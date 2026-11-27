#!/usr/bin/env bash
# #91 Módulo 2 — corridas REAIS entre duas conexões (agenda do instrutor x reserva do aluno). Só roda no banco descartável do scripts/test-db.sh.
# Sincronização por ESTADO OBSERVADO no servidor (pg_stat_activity), nunca por tempo decorrido:
#   a sessão 1 abre uma transação, faz o trabalho e fica em pg_sleep (wait_event = PgSleep) segurando a linha do instrutor; só então a sessão 2 começa;
#   quando a sessão 2 deve ESPERAR, o teste exige ver wait_event_type = Lock nela; quando NÃO deve esperar, exige que ela termine com a sessão 1 ainda em PgSleep.
#  A) reserva em curso x bloqueio: o bloqueio espera (Lock) a reserva e depois é recusado ("reserva em pagamento"). Reserva e bloqueio nunca coexistem.
#  B) bloqueio em curso x reserva: a reserva não espera e não passa por cima (NO_INSTRUCTOR); nada é criado.
#  C) redução de turno em curso x reserva fora do novo turno: a reserva é recusada, nunca aceita no horário antigo.
#  D/E) edição que conflita com reserva pendente é recusada; a transação captura a recusa e permanece em PgSleep.
#     confirm_validation_lesson/confirm_test_payment precisam concluir enquanto a primeira transação segue aberta,
#     comprovando rollback da edição e liberação dos locks, sem cancelamento da reserva.
#  F) edição de agenda em curso x respond_meeting_change (aceitar reagendamento para o dia que a edição fecha): a resposta ESPERA a linha do instrutor (Lock) e é
#     recusada ('Proposed time is no longer available'); o encontro e o pedido ficam como estavam.
#  G) aceite do reagendamento em curso x edição de agenda que fecha o dia novo: a edição ESPERA (Lock), depois vale; o encontro movido NÃO é apagado nem
#     devolvido: fica agendado e é contado como conflito (aula confirmada fora da agenda é só listada). Sem deadlock nem sobreposição.
# Ordem de locks: linha do instrutor primeiro. Nenhum deadlock (pg_stat_database.deadlocks não muda).
# H) FOR NO KEY UPDATE é compatível com a FK, mas o lock explícito FOR UPDATE deve esperar; a mutação verifica essa distinção.
# ONLY=A|...|H roda um só cenário.
set -euo pipefail
: "${PG_TEST_SOCKET:?}"; : "${PG_TEST_PORT:?}"
PSQL=(psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq)
ONLY="${ONLY:-ABCDEFGHI}"
CH="${CHANGE_BASE:-20}"   # dia dos cenários F/G: o reagendamento exige a nova data em até 90 dias
OFF="${OFFSET_BASE:-120}"   # dia inicial dos cenários (cada execução usa dias próprios: as reservas são confirmadas no banco descartável e não se repetem)
A1=00000000-0000-0000-0000-0000000000a1; B1=00000000-0000-0000-0000-0000000000b1
JERI="$("${PSQL[@]}" -c "select id from public.beaches where slug='jeri'")"
out="$(mktemp -d)"; trap '"${PSQL[@]}" -c "drop trigger if exists zz_schedule_confirmation_pause on public.bookings; drop function if exists public.zz_schedule_confirmation_pause()" >/dev/null 2>&1 || true; rm -rf "$out"' EXIT
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
# Isolate disposable fixtures from earlier SQL tests; never part of the production RPC.
"${PSQL[@]}" -c "update public.bookings set status='cancelled',cancelled_at=now() where status='awaiting_payment'" >/dev/null
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

hold_case() { # Rejected edits release locks; both confirmation paths still succeed.
  local letter="$1" off="$2" fn="$3" S wd short bk schedule_before
  S="$(loc "$off" '10:00')"
  bk="$("${PSQL[@]}" -c "$(as $B1 "select public.create_booking('$JERI','first_time','Português','[{\"starts_at\":\"$S\",\"hours\":1}]'::jsonb);")" | tail -1)"
  [[ "$bk" =~ ^[0-9a-f-]{36}$ ]] || fail "$letter: fixture pending booking missing: $bk"
  [ "$("${PSQL[@]}" -c "select status from public.bookings where id='$bk'")" = awaiting_payment ] || fail "$letter: booking must start pending"
  wd="$("${PSQL[@]}" -c "select extract(dow from ((now() at time zone 'America/Fortaleza')::date + $off))::int")"
  short="$(echo "$days" | sed "s/{\"weekday\":$wd,\"opens\":\"08:00\",\"closes\":\"20:00\"}/{\"weekday\":$wd,\"opens\":\"08:00\",\"closes\":\"09:00\"}/")"
  [ "$short" != "$days" ] || fail "$letter: fixture did not shorten day"
  schedule_before="$("${PSQL[@]}" -c "select md5(jsonb_agg(to_jsonb(h) order by weekday)::text) from public.instructor_weekly_hours h where instructor_id='$A1'")"
  bg "conc-${letter}1" "$(as $A1 "do \$policy\$ declare refused boolean:=false; begin begin perform public.save_my_weekly_schedule('$short'::jsonb,0); exception when sqlstate '55000' then if sqlerrm not like 'A pending reservation%' then raise; end if; refused:=true; end; if not refused then raise exception 'Pending schedule change was accepted'; end if; end \$policy\$; select pg_sleep(4);")"
  wait_state "$letter: rejected edit reached synchronization point" "$(sleeping conc-${letter}1)"
  bg "conc-${letter}2" "$(as $B1 "select public.$fn('$bk');")"
  wait_rc "conc-${letter}2"
  [ "$(cat "$out/conc-${letter}2.rc")" = 0 ] || fail "$letter: confirmation must survive rejected edit: $(cat "$out/conc-${letter}2.err")"
  [ "$("${PSQL[@]}" -c "$(sleeping conc-${letter}1)")" = t ] || fail "$letter: confirmation waited on locks leaked by the rejected edit"
  wait_rc "conc-${letter}1"
  [ "$(cat "$out/conc-${letter}1.rc")" = 0 ] || fail "$letter: expected refusal missing: $(cat "$out/conc-${letter}1.err")"
  [ "$("${PSQL[@]}" -c "select status from public.bookings where id='$bk'")" = confirmed ] || fail "$letter: reservation not preserved/confirmed"
  [ "$("${PSQL[@]}" -c "select md5(jsonb_agg(to_jsonb(h) order by weekday)::text) from public.instructor_weekly_hours h where instructor_id='$A1'")" = "$schedule_before" ] || fail "$letter: rejected edit changed schedule"
  [ "$("${PSQL[@]}" -c "select count(*) from public.audit_logs where action='booking.hold_cancelled_availability' and entity_id='$bk'")" = 0 ] || fail "$letter: unexpected cancellation audit"
  echo "PASS $letter: schedule edit refused; original schedule and reservation preserved; confirmation succeeded without waiting on leaked locks"
}
if [[ "$ONLY" == *D* ]]; then hold_case D $((OFF+3)) confirm_validation_lesson; fi
if [[ "$ONLY" == *E* ]]; then hold_case E $((OFF+4)) confirm_test_payment; fi

# ---- F e G: respond_meeting_change x edição de agenda ----
change_case() { # change_case <letra> <offset do dia original>  -> define BK MID RQ ORIG NEW WDNEW
  local letter="$1" off="$2" bk
  ORIG="$(loc "$off" '10:00')"; NEW="$(loc $((off+1)) '10:00')"
  bk="$("${PSQL[@]}" -c "$(as $B1 "select public.create_booking('$JERI','first_time','Português','[{\"starts_at\":\"$ORIG\",\"hours\":1}]'::jsonb);")" | tail -1)"
  [[ "$bk" =~ ^[0-9a-f-]{36}$ ]] || fail "$letter: fixture: reserva não criada: $bk"
  "${PSQL[@]}" -c "$(as $B1 "select public.confirm_test_payment('$bk');")" >/dev/null
  MID="$("${PSQL[@]}" -c "select id from public.booking_meetings where booking_id='$bk'")"
  "${PSQL[@]}" -c "$(as $B1 "select public.request_meeting_change('$MID','$NEW','Preciso mudar a data da aula');")" >/dev/null 2>"$out/$letter.req.err" || fail "$letter: fixture: pedido de reagendamento recusado: $(cat "$out/$letter.req.err")"
  RQ="$("${PSQL[@]}" -c "select id from public.meeting_change_requests where meeting_id='$MID' and status='pending'")"
  [[ "$RQ" =~ ^[0-9a-f-]{36}$ ]] || fail "$letter: fixture: pedido pendente não encontrado"
  BK="$bk"
  WDNEW="$("${PSQL[@]}" -c "select extract(dow from ((now() at time zone 'America/Fortaleza')::date + $((off+1))))::int")"
  CLOSED="$(echo "$days" | sed "s/{\"weekday\":$WDNEW,\"opens\":\"08:00\",\"closes\":\"20:00\"},\?//; s/,\]/]/")"
  [ "$CLOSED" != "$days" ] || fail "$letter: fixture não fechou o dia novo"
}
if [[ "$ONLY" == *F* ]]; then
  change_case F $CH
  bg conc-f1 "$(as $A1 "select public.save_my_weekly_schedule('$CLOSED'::jsonb, 0); select pg_sleep(4);")"
  wait_state "F: edição de agenda em curso segurando o instrutor" "$(sleeping conc-f1)"
  bg conc-f2 "$(as $A1 "select public.respond_meeting_change('$RQ', true);")"
  wait_state "F: a resposta ficou ESPERANDO a linha do instrutor" "$(blocked conc-f2)"
  wait_rc conc-f1; wait_rc conc-f2
  [ "$(cat "$out/conc-f1.rc")" = 0 ] || fail "F: salvar agenda: $(cat "$out/conc-f1.err")"
  [ "$(cat "$out/conc-f2.rc")" != 0 ] || fail "F: o aceite deveria ser recusado (o dia novo foi fechado)"
  grep -q "no longer available\|55000" "$out/conc-f2.err" || fail "F: recusa por motivo inesperado: $(cat "$out/conc-f2.err")"
  [ "$("${PSQL[@]}" -c "select starts_at = '$ORIG'::timestamptz from public.booking_meetings where id='$MID'")" = t ] || fail "F: o encontro não deveria ter mudado de horário"
  [ "$("${PSQL[@]}" -c "select status from public.meeting_change_requests where id='$RQ'")" = pending ] || fail "F: o pedido deveria seguir pendente"
  "${PSQL[@]}" -c "$(as $A1 "select public.save_my_weekly_schedule('$days'::jsonb, 0);")" >/dev/null
  echo "PASS F: a resposta ao reagendamento esperou (Lock observado) a edição de agenda e foi recusada; encontro e pedido intactos"
fi
if [[ "$ONLY" == *G* ]]; then
  change_case G $((CH+20))
  bg conc-g1 "$(as $A1 "select public.respond_meeting_change('$RQ', true); select pg_sleep(4);")"
  wait_state "G: aceite do reagendamento em curso segurando o instrutor" "$(sleeping conc-g1)"
  bg conc-g2 "$(as $A1 "select public.save_my_weekly_schedule('$CLOSED'::jsonb, 0);")"
  wait_state "G: a edição de agenda ficou ESPERANDO a linha do instrutor" "$(blocked conc-g2)"
  wait_rc conc-g1; wait_rc conc-g2
  [ "$(cat "$out/conc-g1.rc")" = 0 ] || fail "G: aceite: $(cat "$out/conc-g1.err")"
  [ "$(cat "$out/conc-g2.rc")" = 0 ] || fail "G: salvar agenda: $(cat "$out/conc-g2.err")"
  [ "$("${PSQL[@]}" -c "select starts_at = '$NEW'::timestamptz and status::text = 'scheduled' from public.booking_meetings where id='$MID'")" = t ] || fail "G: o encontro movido deveria seguir agendado no horário novo (aula confirmada nunca é apagada nem devolvida)"
  [ "$("${PSQL[@]}" -c "select status::text from public.bookings where id='$BK'")" = confirmed ] || fail "G: a reserva deveria seguir confirmada"
  [ "$("${PSQL[@]}" -c "select count(*) from public.audit_logs where action='instructor.schedule_saved' and (new_state->>'conflicting_meetings')::int >= 1 and created_at > now() - interval '1 minute'")" -ge 1 ] || fail "G: a edição deveria ter contado o encontro movido como conflito"
  n="$("${PSQL[@]}" -c "select count(*) from public.booking_meetings a join public.bookings ba on ba.id=a.booking_id join public.booking_meetings b on b.id>a.id and b.booking_id<>a.booking_id join public.bookings bb on bb.id=b.booking_id and bb.instructor_id=ba.instructor_id where ba.instructor_id='$A1' and a.status<>'cancelled' and b.status<>'cancelled' and ba.status='confirmed' and bb.status='confirmed' and a.starts_at>now() and tstzrange(a.starts_at,a.starts_at+make_interval(mins=>a.minutes),'[)') && tstzrange(b.starts_at,b.starts_at+make_interval(mins=>b.minutes),'[)')")"
  [ "$n" = 0 ] || fail "G: sobreposição de encontros confirmados do instrutor: $n"
  "${PSQL[@]}" -c "$(as $A1 "select public.save_my_weekly_schedule('$days'::jsonb, 0);")" >/dev/null
  echo "PASS G: a edição de agenda esperou (Lock observado) o aceite do reagendamento; o encontro movido ficou agendado e contado como conflito, sem sobreposição"
fi

if [[ "$ONLY" == *H* ]]; then
  S="$(loc $((OFF+6)) '10:00')"; E="$(loc $((OFF+6)) '11:00')"
  bg conc-h1 "begin; select id from public.instructors where id='$A1' for no key update; select pg_sleep(4); commit;"
  wait_state "H: instrutor protegido por NO KEY UPDATE" "$(sleeping conc-h1)"
  bg conc-h2 "$(as $A1 "select public.add_my_time_off('$S','$E','block','lock-isolation-${OFF}');")"
  wait_state "H: bloqueio precisa do lock explicito FOR UPDATE" "$(blocked conc-h2)"
  wait_rc conc-h1; wait_rc conc-h2
  [ "$(cat "$out/conc-h2.rc")" = 0 ] || fail "H: bloqueio livre deveria concluir depois do lock: $(cat "$out/conc-h2.err")"
  echo "PASS H: bloqueio espera FOR UPDATE explicito; FK compativel nao mascara a prova"
fi

# I) Validation confirmation already owns the booking. The edit must reject from
# a plain MVCC read, without waiting on that booking and reversing lock order.
if [[ "$ONLY" == *I* ]]; then
  S="$(loc $((OFF+8)) '10:00')"
  BK="$("${PSQL[@]}" -c "$(as $B1 "select public.create_booking('$JERI','first_time','Português','[{\"starts_at\":\"$S\",\"hours\":1}]'::jsonb);")" | tail -1)"
  [[ "$BK" =~ ^[0-9a-f-]{36}$ ]] || fail "I: pending fixture missing"
  wd="$("${PSQL[@]}" -c "select extract(dow from '$S'::timestamptz at time zone 'America/Fortaleza')::int")"
  short="$(echo "$days" | sed "s/{\"weekday\":$wd,\"opens\":\"08:00\",\"closes\":\"20:00\"}/{\"weekday\":$wd,\"opens\":\"08:00\",\"closes\":\"09:00\"}/")"
  before="$("${PSQL[@]}" -c "select md5(jsonb_agg(to_jsonb(h) order by weekday)::text) from public.instructor_weekly_hours h where instructor_id='$A1'")"
  "${PSQL[@]}" -c 'create function public.zz_schedule_confirmation_pause() returns trigger language plpgsql as $$ begin perform pg_sleep(4); return new; end $$;'
  "${PSQL[@]}" -c "create trigger zz_schedule_confirmation_pause after update of status on public.bookings for each row when (new.id='$BK'::uuid and new.status='confirmed' and old.status='awaiting_payment') execute function public.zz_schedule_confirmation_pause()"
  bg conc-i1 "$(as $B1 "select public.confirm_validation_lesson('$BK');")"
  wait_state "I: validation owns booking before queue update" "$(sleeping conc-i1)"
  bg conc-i2 "$(as $A1 "select public.save_my_weekly_schedule('$short'::jsonb,0);")"
  wait_rc conc-i2
  [ "$("${PSQL[@]}" -c "$(sleeping conc-i1)")" = t ] || fail "I: edit waited on booking while holding instructor"
  grep -q "pending reservation" "$out/conc-i2.err" || fail "I: schedule edit must reject pending conflict: $(cat "$out/conc-i2.err")"
  wait_rc conc-i1
  [ "$(cat "$out/conc-i1.rc")" = 0 ] || fail "I: validation confirmation failed: $(cat "$out/conc-i1.err")"
  [ "$("${PSQL[@]}" -c "select status::text from public.bookings where id='$BK'")" = confirmed ] || fail "I: confirmation not preserved"
  [ "$("${PSQL[@]}" -c "select md5(jsonb_agg(to_jsonb(h) order by weekday)::text) from public.instructor_weekly_hours h where instructor_id='$A1'")" = "$before" ] || fail "I: schedule changed after rejection"
  "${PSQL[@]}" -c 'drop trigger zz_schedule_confirmation_pause on public.bookings; drop function public.zz_schedule_confirmation_pause()'
  echo "PASS I: edit rejects without booking lock; validation holding booking completes; no deadlock or schedule change"
fi

[ "$(deadlocks)" = "$dl0" ] || fail "deadlock detectado"
if grep -qi "deadlock" "$out"/*.err 2>/dev/null; then fail "deadlock nas conexões"; fi
"${PSQL[@]}" -c "$(as $A1 "select public.save_my_weekly_schedule('$days'::jsonb, 0);")" >/dev/null
echo "PASS: agenda x reserva sob concorrência real (${ONLY}), sincronizada por estado observado, sem deadlock"
