#!/usr/bin/env bash
# #93 Etapa 1/4 (revisão do ChatGPT, itens 2 e 4): ordem de locks e CORRIDA REAL com duas sessões.
#   Ordem canônica de locks: instrutor -> reserva -> encontro (interrupt_meeting, schedule_meeting_resume, complete_meeting_with_skills,
#   start_ordered_meeting e start_meeting agora seguem a mesma).
#   F1  SENSIBILIDADE: reproduz à mão a ordem ANTIGA (encontro -> reserva) contra schedule_meeting_resume: DEVE dar deadlock (40P01).
#   F2  schedule_meeting_resume (segurando os locks por 1,5 s) x start_ordered_meeting real: sem deadlock; o segundo espera e é recusado/concluído.
#   F3  start_ordered_meeting real (segurando) x schedule_meeting_resume real: sem deadlock; o agendamento é recusado (encontro já em andamento).
#   F4  schedule_meeting_resume x create_booking de OUTRO aluno no mesmo horário/instrutor: sem deadlock e sem dupla reserva do instrutor.
#   F5  create_booking (segurando) x schedule_meeting_resume no mesmo horário: sem deadlock; o agendamento é recusado por conflito.
# Só roda em banco descartável (scripts/test-db.sh). Dados de teste ficam cancelados no fim.
set -euo pipefail
: "${PG_TEST_SOCKET:?}"; : "${PG_TEST_PORT:?}"
PSQL=(psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq)
scratch="$(mktemp -d)"
A1=00000000-0000-0000-0000-0000000000a1; B1=00000000-0000-0000-0000-0000000000b1; B2=00000000-0000-0000-0000-0000000000b2
cleanup() { "${PSQL[@]}" -c "update public.booking_meetings set status='cancelled' where booking_id in (select v::uuid from public.zz_ids where k like 'bk%'); update public.bookings set status='cancelled' where id in (select v::uuid from public.zz_ids where k like 'bk%'); drop table if exists public.zz_ids; drop function if exists public.zz_free_slot(int,int)" >/dev/null 2>&1 || true; rm -rf "$scratch"; }
trap cleanup EXIT
dl0="$("${PSQL[@]}" -c "select deadlocks from pg_stat_database where datname='postgres'")"

"${PSQL[@]}" <<'SQL'
create table public.zz_ids(k text primary key, v text);
create function public.zz_free_slot(p_from int, p_to int) returns timestamptz language sql as $$
  select c.st from (select (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => d, hours => h)) at time zone 'America/Fortaleza' st
    from generate_series(p_from, p_to) d cross join generate_series(8, 10) h) c
  where c.st > now() + interval '2 hours'
    and public.instructor_can_attend('00000000-0000-0000-0000-0000000000a1', jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', 1)))
    and not exists (select 1 from public.booking_meetings m join public.bookings k on k.id = m.booking_id
        where k.student_id in ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2') and m.status::text <> 'cancelled' and k.status::text in ('confirmed','awaiting_payment')
          and tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.minutes), '[)') && tstzrange(c.st - interval '3 hours', c.st + interval '3 hours', '[)'))
  order by c.st limit 1 $$;
do $$
declare a1 constant uuid := '00000000-0000-0000-0000-0000000000a1'; stu constant uuid := '00000000-0000-0000-0000-0000000000b2';
  n int; d1 timestamptz; d2 timestamptz; bk uuid; m1 uuid; m2 uuid; pin text; t timestamptz;
begin
  for n in 1..2 loop   -- n=1: reserva X (F1-F3); n=2: reserva Y (F4-F5), cada uma com o encontro 1 interrompido
    d1 := public.zz_free_slot(3 + (n-1)*70, 60 + (n-1)*70);
    if d1 is null then raise exception 'FIXTURE: sem horario livre para o 1o encontro (reserva %)', n; end if;
    d2 := public.zz_free_slot(((d1 at time zone 'America/Fortaleza')::date - (now() at time zone 'America/Fortaleza')::date) + 3, 200);
    if d2 is null then raise exception 'FIXTURE: sem horario livre para o 2o encontro (reserva %)', n; end if;
    perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
    bk := public.create_booking((select id from public.beaches where slug='jeri'), 'first_time', 'Português',
      jsonb_build_array(jsonb_build_object('starts_at', d1, 'hours', 1), jsonb_build_object('starts_at', d2, 'hours', 1)));
    perform public.simulate_test_payment(bk, 'pix', 'approved');
    execute 'reset role';
    assert (select instructor_id from public.bookings where id = bk) = a1, 'FIXTURE: instrutor a1';
    select id into m1 from public.booking_meetings where booking_id = bk and position = 1;
    select id into m2 from public.booking_meetings where booking_id = bk and position = 2;
    select presence_code into pin from public.bookings where id = bk;
    update public.booking_meetings set starts_at = now() - make_interval(hours => 4 + n*5) where id = m1;
    perform set_config('request.jwt.claim.sub', a1::text, true); execute 'set local role authenticated';
    perform public.start_ordered_meeting(m1, pin);
    perform public.interrupt_meeting(m1, 'Vento forte demais para voar', 30, 30, array[1], array[]::int[]);
    execute 'reset role';
    t := public.zz_free_slot(1, ((d2 at time zone 'America/Fortaleza')::date - (now() at time zone 'America/Fortaleza')::date) - 1);
    assert t is not null, 'FIXTURE: horario de continuidade';
    insert into public.zz_ids values ('bk'||n, bk::text), ('m1_'||n, m1::text), ('pin'||n, pin), ('t'||n, t::text), ('b'||n, bk::text);
  end loop;
end $$;
SQL
id() { "${PSQL[@]}" -c "select v from public.zz_ids where k='$1'"; }
BK1="$(id bk1)"; M1_1="$(id m1_1)"; PIN1="$(id pin1)"; T1="$(id t1)"; BK2="$(id bk2)"; M1_2="$(id m1_2)"; T2="$(id t2)"
JERI="$("${PSQL[@]}" -c "select id from public.beaches where slug='jeri'")"
as_inst() { printf "set role authenticated; select set_config('request.jwt.claim.sub','%s',false);\n" "$A1"; }
as_stu()  { printf "set role authenticated; select set_config('request.jwt.claim.sub','%s',false);\n" "$1"; }
run() { # $1=nome $2=arquivo sql -> .out/.err/.rc
  set +e; "${PSQL[@]}" -f "$2" > "$scratch/$1.out" 2> "$scratch/$1.err"; echo $? > "$scratch/$1.rc"; set -e; }
dl() { "${PSQL[@]}" -c "select deadlocks from pg_stat_database where datname='postgres'"; }
state() { "${PSQL[@]}" -c "select status::text||'/'||coalesce(interruption_state,'-') from public.booking_meetings where id='$1'"; }
nodead() { if grep -qi "deadlock\|40P01" "$scratch"/$1*.err 2>/dev/null; then echo "DEADLOCK inesperado em $1:" >&2; cat "$scratch"/$1*.err >&2; exit 1; fi; }

# ---- F1: SENSIBILIDADE (ordem ANTIGA emulada: encontro -> reserva) contra a RPC real (reserva -> encontro) ----
cat > "$scratch/f1a.sql" <<SQL
begin; select id from public.booking_meetings where id='$M1_1' for update; select pg_sleep(1.5); select id from public.bookings where id='$BK1' for update; commit;
SQL
{ as_inst; echo "select public.schedule_meeting_resume('$M1_1'::uuid, '$T1'::timestamptz);"; } > "$scratch/f1b.sql"
dlb="$(dl)"
run f1a "$scratch/f1a.sql" & p1=$!; sleep 0.5; run f1b "$scratch/f1b.sql" & p2=$!; wait $p1 $p2 || true
if ! grep -qi "deadlock" "$scratch/f1a.err" "$scratch/f1b.err" || [ "$(dl)" = "$dlb" ]; then echo "F1: a ordem ANTIGA deveria produzir deadlock (teste insensivel)" >&2; exit 1; fi
echo "F1 ok: a ordem antiga (encontro -> reserva) dá deadlock, como previsto"
# volta ao estado de partida (a vitima pode ser qualquer um)
"${PSQL[@]}" -c "update public.booking_meetings set interruption_state='awaiting_resume', resume_scheduled_at=null where id='$M1_1' and interruption_state='resume_scheduled'" >/dev/null
dla="$(dl)"

# ---- F2: schedule_meeting_resume (segura 1,5 s) x start_ordered_meeting real ----
{ as_inst; echo "begin; select public.schedule_meeting_resume('$M1_1'::uuid, '$T1'::timestamptz); select pg_sleep(1.5); commit;"; } > "$scratch/f2a.sql"
{ as_inst; echo "select public.start_ordered_meeting('$M1_1'::uuid, '$PIN1');"; } > "$scratch/f2b.sql"
run f2a "$scratch/f2a.sql" & p1=$!; sleep 0.5; run f2b "$scratch/f2b.sql" & p2=$!; wait $p1 $p2 || true
nodead f2
[ "$(cat "$scratch/f2a.rc")" = "0" ] || { echo "F2: o agendamento deveria concluir" >&2; cat "$scratch/f2a.err" >&2; exit 1; }
grep -qi "start window\|55000" "$scratch/f2b.err" || [ "$(cat "$scratch/f2b.rc")" = "0" ] || { echo "F2: start_ordered deveria concluir ou ser recusado (55000)" >&2; cat "$scratch/f2b.err" >&2; exit 1; }
[ "$(state "$M1_1")" = "scheduled/resume_scheduled" ] || { echo "F2: estado final inesperado: $(state "$M1_1")" >&2; exit 1; }
echo "F2 ok: schedule x start_ordered sem deadlock"

# ---- F3: start_ordered_meeting real (segura) x schedule_meeting_resume real ----
"${PSQL[@]}" -c "update public.booking_meetings set starts_at = now() + interval '1 hour' where id='$M1_1'" >/dev/null
{ as_inst; echo "begin; select public.start_ordered_meeting('$M1_1'::uuid, '$PIN1'); select pg_sleep(1.5); commit;"; } > "$scratch/f3a.sql"
{ as_inst; echo "select public.schedule_meeting_resume('$M1_1'::uuid, '$T1'::timestamptz);"; } > "$scratch/f3b.sql"
run f3a "$scratch/f3a.sql" & p1=$!; sleep 0.5; run f3b "$scratch/f3b.sql" & p2=$!; wait $p1 $p2 || true
nodead f3
[ "$(cat "$scratch/f3a.rc")" = "0" ] || { echo "F3: o inicio deveria concluir" >&2; cat "$scratch/f3a.err" >&2; exit 1; }
grep -q "55000\|Only an interrupted meeting" "$scratch/f3b.err" || { echo "F3: o agendamento deveria ser recusado (encontro em andamento)" >&2; cat "$scratch/f3b.err" >&2; exit 1; }
[ "$(state "$M1_1")" = "in_progress/resume_scheduled" ] || { echo "F3: estado final inesperado: $(state "$M1_1")" >&2; exit 1; }
echo "F3 ok: start_ordered x schedule sem deadlock; o agendamento tardio foi recusado"

# ---- F4: schedule_meeting_resume (segura) x create_booking de OUTRO aluno no MESMO horario ----
{ as_inst; echo "begin; select public.schedule_meeting_resume('$M1_2'::uuid, '$T2'::timestamptz); select pg_sleep(1.5); commit;"; } > "$scratch/f4a.sql"
{ as_stu "$B1"; echo "select public.create_booking('$JERI'::uuid, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', '$T2'::timestamptz, 'hours', 1)));"; } > "$scratch/f4b.sql"
run f4a "$scratch/f4a.sql" & p1=$!; sleep 0.5; run f4b "$scratch/f4b.sql" & p2=$!; wait $p1 $p2 || true
nodead f4
[ "$(cat "$scratch/f4a.rc")" = "0" ] || { echo "F4: o agendamento deveria concluir" >&2; cat "$scratch/f4a.err" >&2; exit 1; }
if [ "$(cat "$scratch/f4b.rc")" != "0" ]; then grep -q "NO_INSTRUCTOR\|No instructor available" "$scratch/f4b.err" || { echo "F4: criacao falhou por motivo inesperado" >&2; cat "$scratch/f4b.err" >&2; exit 1; }; fi
# nenhuma dupla reserva do instrutor a1 (consulta Q6 do repositorio)
n="$("${PSQL[@]}" -c "select count(*) from public.booking_meetings a join public.bookings ba on ba.id=a.booking_id join public.booking_meetings b on b.id>a.id and b.booking_id<>a.booking_id join public.bookings bb on bb.id=b.booking_id and bb.instructor_id=ba.instructor_id where ba.instructor_id='$A1' and a.status<>'cancelled' and b.status<>'cancelled' and ba.status in ('confirmed','awaiting_payment') and bb.status in ('confirmed','awaiting_payment') and a.starts_at>now() and tstzrange(a.starts_at,a.starts_at+make_interval(mins=>a.minutes),'[)') && tstzrange(b.starts_at,b.starts_at+make_interval(mins=>b.minutes),'[)')")"
[ "$n" = "0" ] || { echo "F4: dupla reserva do instrutor a1: $n par(es) sobreposto(s)" >&2; exit 1; }
echo "F4 ok: schedule x create_booking sem deadlock e sem dupla reserva (criacao: rc=$(cat "$scratch/f4b.rc"))"
# cancela a reserva criada pelo aluno b1 em F4, se houver, para nao ocupar o horario em F5
"${PSQL[@]}" -c "update public.booking_meetings set status='cancelled' where booking_id in (select id from public.bookings where student_id='$B1'::uuid and created_at > now() - interval '2 minutes'); update public.bookings set status='cancelled' where student_id='$B1'::uuid and created_at > now() - interval '2 minutes'" >/dev/null
"${PSQL[@]}" -c "update public.booking_meetings set starts_at = now() - interval '9 hours', status='scheduled', interruption_state='awaiting_resume', resume_scheduled_at=null where id='$M1_2'" >/dev/null

# ---- F5: create_booking (segura o instrutor) x schedule_meeting_resume no mesmo horario ----
{ as_stu "$B1"; echo "begin; select public.create_booking('$JERI'::uuid, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', '$T2'::timestamptz, 'hours', 1))); select pg_sleep(1.5); commit;"; } > "$scratch/f5a.sql"
{ as_inst; echo "select public.schedule_meeting_resume('$M1_2'::uuid, '$T2'::timestamptz);"; } > "$scratch/f5b.sql"
run f5a "$scratch/f5a.sql" & p1=$!; sleep 0.5; run f5b "$scratch/f5b.sql" & p2=$!; wait $p1 $p2 || true
nodead f5
n="$("${PSQL[@]}" -c "select count(*) from public.booking_meetings a join public.bookings ba on ba.id=a.booking_id join public.booking_meetings b on b.id>a.id and b.booking_id<>a.booking_id join public.bookings bb on bb.id=b.booking_id and bb.instructor_id=ba.instructor_id where ba.instructor_id='$A1' and a.status<>'cancelled' and b.status<>'cancelled' and ba.status in ('confirmed','awaiting_payment') and bb.status in ('confirmed','awaiting_payment') and a.starts_at>now() and tstzrange(a.starts_at,a.starts_at+make_interval(mins=>a.minutes),'[)') && tstzrange(b.starts_at,b.starts_at+make_interval(mins=>b.minutes),'[)')")"
[ "$n" = "0" ] || { echo "F5: dupla reserva do instrutor a1: $n" >&2; exit 1; }
if [ "$(cat "$scratch/f5a.rc")" = "0" ] && [ "$(cat "$scratch/f5b.rc")" = "0" ]; then
  # as duas concluiram: so e possivel se a criacao foi para OUTRO instrutor (a1 estava travado e foi pulado)
  [ "$("${PSQL[@]}" -c "select count(*) from public.bookings where student_id='$B1'::uuid and created_at > now() - interval '2 minutes' and instructor_id='$A1'")" = "0" ] || { echo "F5: as duas concluiram com a1 nos dois" >&2; exit 1; }
fi
dl1="$(dl)"
echo "Deadlocks do banco: antes de tudo=$dl0, apos a sensibilidade F1=$dla, no fim=$dl1 (esperado: so o 1 provocado em F1 => fim=$dla)"
[ "$dl1" = "$dla" ] || { echo "houve deadlock fora de F1" >&2; exit 1; }
echo "PASS: ordem canonica de locks (instrutor -> reserva -> encontro): sem deadlock com start_ordered_meeting e create_booking em duas sessoes; a ordem antiga dava deadlock (F1)"
