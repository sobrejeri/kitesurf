#!/usr/bin/env bash
# Lote #2 (tarefa 3 e 6): CORRIDAS REAIS com duas sessões na fila de ofertas. Só no banco descartável de scripts/test-db.sh.
#   C1 aceite duplo da MESMA oferta em duas sessões: exatamente uma reserva; a segunda não cria outra.
#   C2 aceite × job de expiração, o job na frente (oferta já vencida): o aceite espera, vê a oferta vencida, NÃO cria reserva e o pedido passa ao próximo instrutor.
#   C3 aceite × job, o aceite na frente (oferta ainda válida): uma reserva; o job pula o pedido (não oferece a outro nem cria segunda oferta).
#   Em todos: 0 deadlocks, no máximo 1 oferta viva por pedido, nenhum instrutor repetido, nenhuma reserva órfã.
set -euo pipefail
: "${PG_TEST_SOCKET:?}"; : "${PG_TEST_PORT:?}"
PSQL=(psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq)
scratch="$(mktemp -d)"; trap 'rm -rf "$scratch"' EXIT
STU=00000000-0000-0000-0000-0000000000b2; A1=00000000-0000-0000-0000-0000000000a1; A2=00000000-0000-0000-0000-0000000000a2
PREA="$("${PSQL[@]}" -c "select id from public.beaches where slug='prea'")"
dl0="$("${PSQL[@]}" -c "select deadlocks from pg_stat_database where datname='postgres'")"

new_request() { # $1 = dias a partir de (para não colidir entre cenários); imprime "pedido|oferta|instrutor"
  "${PSQL[@]}" -F '|' <<SQL
do \$\$
declare v_s timestamptz; v_req uuid;
begin
  select st into v_s from (select (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => d, hours => h)) at time zone 'America/Fortaleza' st
      from generate_series($1, $1 + 80) d cross join generate_series(8, 13) h) c
    where public.instructor_can_attend('$A1', jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', 2)))
      and public.instructor_can_attend('$A2', jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', 2)))
      and not exists (select 1 from public.booking_meetings m join public.bookings b on b.id = m.booking_id
          where b.student_id = '$STU' and m.status::text <> 'cancelled' and b.status::text in ('confirmed', 'awaiting_payment')
            and tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.minutes), '[)') && tstzrange(c.st - interval '3 hours', c.st + interval '7 hours', '[)'))
    order by c.st limit 1;
  if v_s is null then raise exception 'FIXTURE: sem horario comum para a1 e a2'; end if;
  perform set_config('request.jwt.claim.sub', '$STU', true); execute 'set local role authenticated';
  v_req := public.create_instructor_request('$PREA'::uuid, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', v_s, 'hours', 2)));
  execute 'reset role';
  create temp table if not exists zz_out(r uuid); truncate zz_out; insert into zz_out values (v_req);
end \$\$;
SQL
  "${PSQL[@]}" -F '|' -c "select r.id, o.id, o.instructor_id from public.instructor_requests r join public.instructor_offers o on o.request_id=r.id and o.status='offered' where r.student_id='$STU' order by r.created_at desc limit 1"
}
as_inst() { printf "set role authenticated; select set_config('request.jwt.claim.sub','%s',false);\n" "$1"; }
run() { set +e; "${PSQL[@]}" -f "$2" > "$scratch/$1.out" 2> "$scratch/$1.err"; echo $? > "$scratch/$1.rc"; set -e; }
nodead() { if grep -qi "deadlock\|40P01" "$scratch"/$1*.err 2>/dev/null; then echo "DEADLOCK em $1:" >&2; cat "$scratch"/$1*.err >&2; exit 1; fi; }
n_bookings_for() { "${PSQL[@]}" -c "select count(*) from public.bookings b join public.instructor_requests r on r.booking_id=b.id where r.id='$1'"; }
live_offers() { "${PSQL[@]}" -c "select count(*) from public.instructor_offers where request_id='$1' and status in ('offered','suggested') and expires_at > now()"; }
dup_instr() { "${PSQL[@]}" -c "select count(*) from (select instructor_id from public.instructor_offers where request_id='$1' group by 1 having count(*)>1) x"; }
total_bookings() { "${PSQL[@]}" -c "select count(*) from public.bookings where student_id='$STU'"; }

# ---------------- C1: aceite duplo da mesma oferta ----------------
IFS='|' read -r REQ OFF INS <<<"$(new_request 4)"
[ -n "$REQ" ] && [ -n "$OFF" ] || { echo "C1: sem oferta viva para testar" >&2; exit 1; }
tb0="$(total_bookings)"
{ as_inst "$INS"; echo "begin; select public.accept_instructor_offer('$OFF'::uuid); select pg_sleep(1.5); commit;"; } > "$scratch/c1a.sql"
{ as_inst "$INS"; echo "select public.accept_instructor_offer('$OFF'::uuid);"; } > "$scratch/c1b.sql"
run c1a "$scratch/c1a.sql" & p1=$!; sleep 0.5; run c1b "$scratch/c1b.sql" & p2=$!; wait $p1 $p2 || true
nodead c1
[ "$(cat "$scratch/c1a.rc")" = "0" ] || { echo "C1: o primeiro aceite deveria concluir" >&2; cat "$scratch/c1a.err" >&2; exit 1; }
[ "$(n_bookings_for "$REQ")" = "1" ] && [ "$(( $(total_bookings) - tb0 ))" = "1" ] || { echo "C1: deveria existir exatamente 1 reserva para o pedido e 1 a mais no total (pedido=$(n_bookings_for "$REQ"), delta=$(( $(total_bookings) - tb0 )))" >&2; exit 1; }
[ "$("${PSQL[@]}" -c "select status from public.instructor_requests where id='$REQ'")" = "accepted" ] || { echo "C1: pedido deveria estar accepted" >&2; exit 1; }
echo "C1 ok: aceite duplo em duas sessões gera uma única reserva (segunda sessão: rc=$(cat "$scratch/c1b.rc"))"

# ---------------- C2: job na frente (oferta vencida), aceite depois ----------------
IFS='|' read -r REQ OFF INS <<<"$(new_request 8)"
"${PSQL[@]}" -c "update public.instructor_offers set expires_at = now() - interval '1 second' where id='$OFF'"
tb0="$(total_bookings)"
{ echo "begin; select public.run_queue_expiry_job(50); select pg_sleep(1.5); commit;"; } > "$scratch/c2a.sql"
{ as_inst "$INS"; echo "select public.accept_instructor_offer('$OFF'::uuid);"; } > "$scratch/c2b.sql"
run c2a "$scratch/c2a.sql" & p1=$!; sleep 0.5; run c2b "$scratch/c2b.sql" & p2=$!; wait $p1 $p2 || true
nodead c2
[ "$(cat "$scratch/c2a.rc")" = "0" ] || { echo "C2: o job deveria concluir" >&2; cat "$scratch/c2a.err" >&2; exit 1; }
[ "$(total_bookings)" = "$tb0" ] && [ "$(n_bookings_for "$REQ")" = "0" ] || { echo "C2: nenhuma reserva pode nascer de uma oferta vencida" >&2; exit 1; }
[ "$("${PSQL[@]}" -c "select status from public.instructor_offers where id='$OFF'")" = "expired" ] || { echo "C2: a oferta vencida deveria estar expired" >&2; exit 1; }
[ "$(live_offers "$REQ")" = "1" ] && [ "$(dup_instr "$REQ")" = "0" ] || { echo "C2: deveria haver exatamente 1 oferta viva, para outro instrutor (vivas=$(live_offers "$REQ"), repetidos=$(dup_instr "$REQ"))" >&2; exit 1; }
echo "C2 ok: aceite depois do job (oferta vencida) não cria reserva; o pedido passou ao próximo instrutor, sem repetir ninguém"

# ---------------- C3: aceite na frente (oferta válida), job depois ----------------
IFS='|' read -r REQ OFF INS <<<"$(new_request 14)"
tb0="$(total_bookings)"
{ as_inst "$INS"; echo "begin; select public.accept_instructor_offer('$OFF'::uuid); select pg_sleep(1.5); commit;"; } > "$scratch/c3a.sql"
{ echo "select public.run_queue_expiry_job(50);"; } > "$scratch/c3b.sql"
run c3a "$scratch/c3a.sql" & p1=$!; sleep 0.5; run c3b "$scratch/c3b.sql" & p2=$!; wait $p1 $p2 || true
nodead c3
[ "$(cat "$scratch/c3a.rc")" = "0" ] && [ "$(cat "$scratch/c3b.rc")" = "0" ] || { echo "C3: aceite e job deveriam concluir" >&2; cat "$scratch/c3a.err" "$scratch/c3b.err" >&2; exit 1; }
[ "$(n_bookings_for "$REQ")" = "1" ] && [ "$(( $(total_bookings) - tb0 ))" = "1" ] || { echo "C3: exatamente 1 reserva" >&2; exit 1; }
[ "$(live_offers "$REQ")" = "0" ] && [ "$(dup_instr "$REQ")" = "0" ] || { echo "C3: pedido aceito não pode ter oferta viva nem instrutor repetido" >&2; exit 1; }
# nenhuma reserva órfã: toda reserva criada por pedido tem encontros e pedido accepted
[ "$("${PSQL[@]}" -c "select count(*) from public.bookings b where b.student_id='$STU' and b.created_at > now() - interval '5 minutes' and not exists (select 1 from public.booking_meetings m where m.booking_id=b.id)")" = "0" ] || { echo "reserva órfã (sem encontros)" >&2; exit 1; }
dl1="$("${PSQL[@]}" -c "select deadlocks from pg_stat_database where datname='postgres'")"
[ "$dl1" = "$dl0" ] || { echo "houve deadlock no banco ($dl0 -> $dl1)" >&2; exit 1; }
echo "C3 ok: aceite na frente do job gera uma reserva; o job pula o pedido (sem segunda oferta)"
echo "PASS: fila de ofertas em corrida real (duas sessões): aceite duplo, aceite × expiração nos dois sentidos; uma reserva por pedido, 0 deadlocks, sem repetição nem reserva órfã"
