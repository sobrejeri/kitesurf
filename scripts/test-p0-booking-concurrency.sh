#!/usr/bin/env bash
# P0 #90/#91 (PRs #296 + #298 juntas): corridas reais com conexões independentes, soltas ao mesmo tempo por uma
# barreira de advisory lock. Só roda no banco descartável criado por scripts/test-db.sh. Pagamento é o simulado do banco de teste.
#
# A) dois alunos disputam o MESMO horário do mesmo instrutor, um pela RPC de 6 args e outro pela legada de 5 args:
#    exatamente uma reserva fica de pé.
# B) UM aluno reserva e "paga" (simulado) duas aulas sobrepostas em praias/instrutores diferentes ao mesmo tempo, cada passo
#    numa transação própria, como o app faz (criar reserva e pagar são requisições separadas):
#    exatamente uma fica confirmada; a outra é recusada (STUDENT_MEETING_CONFLICT, ou NO_INSTRUCTOR se o instrutor estiver travado pela concorrente).
# Em ambos: sem reserva órfã, agenda do instrutor perdedor intacta, fila de solicitações/ofertas intacta e
# NENHUM deadlock. Ordem canônica dos locks: linha do instrutor (skip locked) -> linha do perfil do aluno -> lock advisory do aluno.
# (Criar e pagar na MESMA transação inverte perfil/lock do aluno e pode dar deadlock; o app não faz isso e a ordem não deve ser "consertada" no create_booking.)
# NENHUM deadlock (pg_stat_database.deadlocks não muda e nenhum SQLSTATE 40P01).
set -euo pipefail
: "${PG_TEST_SOCKET:?}"; : "${PG_TEST_PORT:?}"
ROUNDS="${P0_ROUNDS:-6}"
PSQL=(psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq)
scratch="$(mktemp -d)"; trap 'rm -rf "$scratch"' EXIT
A1=00000000-0000-0000-0000-0000000000a1; A2=00000000-0000-0000-0000-0000000000a2
B1=00000000-0000-0000-0000-0000000000b1; B2=00000000-0000-0000-0000-0000000000b2
JERI="$("${PSQL[@]}" -c "select id from public.beaches where slug='jeri'")"
PREA="$("${PSQL[@]}" -c "select id from public.beaches where slug='prea'")"
[[ "$JERI" =~ ^[0-9a-f-]{36}$ && "$PREA" =~ ^[0-9a-f-]{36}$ ]] || { echo "Praias de fixture ausentes" >&2; exit 1; }

deadlocks() { "${PSQL[@]}" -c "select deadlocks from pg_stat_database where datname='postgres'"; }
# Solicitações e ofertas não podem ser tocadas por reservas diretas. (queue_position muda de propósito quando um pagamento confirma:
# o instrutor vai para o fim da fila; por isso só exigimos posições únicas, abaixo.)
queue_state() { "${PSQL[@]}" -c "select (select count(*) from public.instructor_requests)||'/'||(select count(*) from public.instructor_offers)"; }
dupq_count() { "${PSQL[@]}" -c "select count(*) from (select queue_position from public.instructors group by 1 having count(*)>1) x"; }
dl0="$(deadlocks)"; q0="$(queue_state)"; dupq0="$(dupq_count)"

# Um horário S (2h) livre para a1 e, 30 min depois, para a2; alunos b1 e b2 sem nenhum encontro perto.
pick_slot() {
  "${PSQL[@]}" -c "
  with slots as (
    select (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days=>d, hours=>h)) at time zone 'America/Fortaleza' as st
    from generate_series(2, 120) d cross join generate_series(8, 13) h)
  select st::text from slots
  where public.instructor_can_attend('$A1'::uuid, jsonb_build_array(jsonb_build_object('starts_at', st, 'hours', 2)))
    and public.instructor_can_attend('$A2'::uuid, jsonb_build_array(jsonb_build_object('starts_at', st + interval '30 minutes', 'hours', 2)))
    and not exists (select 1 from public.booking_meetings m join public.bookings b on b.id=m.booking_id
        where b.student_id in ('$B1'::uuid,'$B2'::uuid) and m.status::text <> 'cancelled' and b.status::text <> 'cancelled'
          and tstzrange(m.starts_at, m.starts_at + make_interval(mins=>m.minutes), '[)') && tstzrange(st - interval '3 hours', st + interval '6 hours', '[)'))
  order by st limit 1"
}

why_no_slot() { # diagnóstico quando não há horário: conta candidatos que passam em cada condição
  "${PSQL[@]}" -c "
  with slots as (
    select (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days=>d, hours=>h)) at time zone 'America/Fortaleza' as st
    from generate_series(2, 120) d cross join generate_series(8, 13) h)
  select 'candidatos='||count(*)||' a1_ok='||count(*) filter (where public.instructor_can_attend('$A1'::uuid, jsonb_build_array(jsonb_build_object('starts_at', st, 'hours', 2))))
    ||' a2_ok='||count(*) filter (where public.instructor_can_attend('$A2'::uuid, jsonb_build_array(jsonb_build_object('starts_at', st + interval '30 minutes', 'hours', 2))))
    ||' alunos_livres='||count(*) filter (where not exists (select 1 from public.booking_meetings m join public.bookings b on b.id=m.booking_id
        where b.student_id in ('$B1'::uuid,'$B2'::uuid) and m.status::text <> 'cancelled'
          and tstzrange(m.starts_at, m.starts_at + make_interval(mins=>m.minutes), '[)') && tstzrange(st - interval '3 hours', st + interval '6 hours', '[)'))) from slots" >&2
}

# Solta várias sessões juntas: cada uma espera um lock compartilhado que um "portão" mantém exclusivo.
run_together() { # $@ = arquivos .sql; define status_N e err em $scratch
  local gate_pid pids=() i=0 f
  "${PSQL[@]}" -c "select pg_advisory_lock(7770001); select pg_sleep(1.6)" >/dev/null 2>&1 & gate_pid=$!
  sleep 0.4
  for f in "$@"; do i=$((i+1)); "${PSQL[@]}" -f "$f" > "$scratch/out$i" 2> "$scratch/err$i" & pids+=($!); done
  i=0; for p in "${pids[@]}"; do i=$((i+1)); wait "$p" && echo 0 > "$scratch/st$i" || echo 1 > "$scratch/st$i"; done
  wait "$gate_pid" || true
}
session() { # $1 aluno  $2 arquivo  $3 conteúdo SQL após begin (usa :id)
  cat > "$2" <<SQL
set role authenticated;
select set_config('request.jwt.claim.sub', '$1', false);
select pg_advisory_lock_shared(7770001);
$3
SQL
}

# Libera os horários usados pela rodada (cancela as reservas criadas por ela, como um aluno cancelaria), para a suíte
# inteira não esgotar a agenda do instrutor de fixture. O cancelamento também precisa funcionar nesse estado.
cleanup_round() { # $1 = instante de início da rodada
  "${PSQL[@]}" -c "update public.bookings set status='cancelled', cancelled_at=now() where student_id in ('$B1'::uuid,'$B2'::uuid) and created_at >= '$1'::timestamptz and status::text in ('awaiting_payment','confirmed')" >/dev/null
}

# ---------- A) mesmo horário, assinatura de 6 args contra a legada de 5 args ----------
for r in $(seq 1 "$ROUNDS"); do
  t0="$("${PSQL[@]}" -c "select clock_timestamp()")"
  S="$(pick_slot)"; [[ "$S" =~ ^[0-9]{4}- ]] || { echo "Sem horário elegível (rodada A$r)" >&2; why_no_slot; exit 1; }
  M="jsonb_build_array(jsonb_build_object('starts_at', '$S', 'hours', 2))"
  session "$B1" "$scratch/a1.sql" "select public.create_booking('$JERI'::uuid, 'first_time', 'Português', $M, null::text, false);"
  session "$B2" "$scratch/a2.sql" "select public.create_booking('$JERI'::uuid, 'first_time', 'Português', $M, null::text);"
  [ $((r % 2)) -eq 0 ] && { mv "$scratch/a1.sql" "$scratch/tmp.sql"; mv "$scratch/a2.sql" "$scratch/a1.sql"; mv "$scratch/tmp.sql" "$scratch/a2.sql"; }  # alterna quem usa a legada
  before="$("${PSQL[@]}" -c "select count(*) from public.bookings")"
  run_together "$scratch/a1.sql" "$scratch/a2.sql"
  s1=$(cat "$scratch/st1"); s2=$(cat "$scratch/st2")
  if [ $((s1 + s2)) -ne 1 ]; then echo "A$r: esperado exatamente uma reserva aceita (status $s1/$s2)" >&2; cat "$scratch/err1" "$scratch/err2" >&2; exit 1; fi
  grep -qi "40P01\|deadlock" "$scratch/err1" "$scratch/err2" && { echo "A$r: deadlock" >&2; exit 1; }
  after="$("${PSQL[@]}" -c "select count(*) from public.bookings")"
  [ "$after" -eq $((before + 1)) ] || { echo "A$r: esperado +1 reserva, obteve $((after - before))" >&2; exit 1; }
  held="$("${PSQL[@]}" -c "select count(*) from public.booking_meetings m join public.bookings b on b.id=m.booking_id where b.instructor_id='$A1' and m.status::text<>'cancelled' and b.status::text in ('confirmed','awaiting_payment') and m.starts_at='$S'")"
  [ "$held" -eq 1 ] || { echo "A$r: o horário deveria estar com exatamente 1 encontro, tem $held" >&2; exit 1; }
  cleanup_round "$t0"
  free="$("${PSQL[@]}" -c "select public.instructor_can_attend('$A1'::uuid, jsonb_build_array(jsonb_build_object('starts_at', '$S'::timestamptz, 'hours', 2)))")"
  [ "$free" = "t" ] || { echo "A$r: após cancelar, o horário do instrutor deveria voltar a ficar livre" >&2; exit 1; }
done

# ---------- B) um aluno, duas aulas sobrepostas, duas praias, pagamento simulado, ao mesmo tempo ----------
for r in $(seq 1 "$ROUNDS"); do
  t0="$("${PSQL[@]}" -c "select clock_timestamp()")"
  S="$(pick_slot)"; [[ "$S" =~ ^[0-9]{4}- ]] || { echo "Sem horário elegível (rodada B$r)" >&2; why_no_slot; exit 1; }
  M1="jsonb_build_array(jsonb_build_object('starts_at', '$S'::timestamptz, 'hours', 2))"
  M2="jsonb_build_array(jsonb_build_object('starts_at', '$S'::timestamptz + interval '30 minutes', 'hours', 2))"
  session "$B1" "$scratch/b1.sql" "select public.create_booking('$JERI'::uuid, 'first_time', 'Português', $M1, null::text, false) as id \\gset
select public.simulate_test_payment(:'id'::uuid, 'pix', 'approved');"
  session "$B1" "$scratch/b2.sql" "select public.create_booking('$PREA'::uuid, 'first_time', 'Português', $M2, null::text, false) as id \\gset
select public.simulate_test_payment(:'id'::uuid, 'pix', 'approved');"
  # Uma corrida do mesmo aluno não pode alterar reservas de outro aluno da fixture.
  # A comparação é por estado agregado, não por contagem global de reservas.
  other_before="$("${PSQL[@]}" -c "select coalesce(md5(string_agg(id::text || '/' || status::text || '/' || coalesce(instructor_id::text,''), ',' order by id)), '-') from public.bookings where student_id='$B2'::uuid")"
  run_together "$scratch/b1.sql" "$scratch/b2.sql"
  other_after="$("${PSQL[@]}" -c "select coalesce(md5(string_agg(id::text || '/' || status::text || '/' || coalesce(instructor_id::text,''), ',' order by id)), '-') from public.bookings where student_id='$B2'::uuid")"
  [ "$other_after" = "$other_before" ] || { echo "B$r: corrida do aluno B1 alterou reservas de B2" >&2; exit 1; }
  s1=$(cat "$scratch/st1"); s2=$(cat "$scratch/st2")
  if [ $((s1 + s2)) -ne 1 ]; then echo "B$r: esperado exatamente uma aula confirmada (status $s1/$s2)" >&2; cat "$scratch/err1" "$scratch/err2" >&2; exit 1; fi
  loser_err="$scratch/err1"; [ "$s1" -eq 0 ] && loser_err="$scratch/err2"
  # Recusa legítima: conflito do aluno (#298) OU instrutor momentaneamente travado/ocupado pela outra reserva (#283/#296, skip locked).
  grep -q "STUDENT_MEETING_CONFLICT\|Student already has a meeting\|NO_INSTRUCTOR" "$loser_err" || { echo "B$r: a tentativa rejeitada falhou por motivo inesperado:" >&2; cat "$loser_err" >&2; exit 1; }
  grep -qi "40P01\|deadlock" "$scratch/err1" "$scratch/err2" && { echo "B$r: deadlock" >&2; exit 1; }
  # Agenda do aluno: um único encontro ativo na janela; nenhuma reserva ficou pendente por causa da recusa.
  active="$("${PSQL[@]}" -c "select count(*) from public.booking_meetings m join public.bookings b on b.id=m.booking_id where b.student_id='$B1' and m.status::text<>'cancelled' and b.status::text in ('confirmed','awaiting_payment') and tstzrange(m.starts_at, m.starts_at+make_interval(mins=>m.minutes),'[)') && tstzrange('$S'::timestamptz, '$S'::timestamptz+interval '150 minutes','[)')")"
  [ "$active" -eq 1 ] || { echo "B$r: aluno com $active encontros ativos na janela (esperado 1)" >&2; exit 1; }
  pend="$("${PSQL[@]}" -c "select count(*) from public.bookings b join public.booking_meetings m on m.booking_id=b.id where b.student_id='$B1' and b.status::text='awaiting_payment' and m.status::text<>'cancelled' and tstzrange(m.starts_at, m.starts_at+make_interval(mins=>m.minutes),'[)') && tstzrange('$S'::timestamptz, '$S'::timestamptz+interval '150 minutes','[)')")"
  [ "$pend" -eq 0 ] || { echo "B$r: sobrou reserva pendente da tentativa rejeitada" >&2; exit 1; }
  # Cada instrutor tem no máximo um encontro ativo na janela, e só o vencedor tem.
  dup="$("${PSQL[@]}" -c "select count(*) from (select b.instructor_id from public.booking_meetings m join public.bookings b on b.id=m.booking_id where m.status::text<>'cancelled' and b.status::text in ('confirmed','awaiting_payment') and tstzrange(m.starts_at, m.starts_at+make_interval(mins=>m.minutes),'[)') && tstzrange('$S'::timestamptz, '$S'::timestamptz+interval '150 minutes','[)') group by 1 having count(*)>1) x")"
  [ "$dup" -eq 0 ] || { echo "B$r: instrutor com dois encontros sobrepostos" >&2; exit 1; }
  cleanup_round "$t0"
  left="$("${PSQL[@]}" -c "select count(*) from public.bookings b join public.booking_meetings m on m.booking_id=b.id where b.student_id='$B1' and b.status::text in ('confirmed','awaiting_payment') and m.status::text<>'cancelled' and tstzrange(m.starts_at, m.starts_at+make_interval(mins=>m.minutes),'[)') && tstzrange('$S'::timestamptz, '$S'::timestamptz+interval '150 minutes','[)')")"
  [ "$left" -eq 0 ] || { echo "B$r: após cancelar, o aluno ainda tem $left encontro(s) ativo(s) na janela" >&2; exit 1; }
done

[ "$(deadlocks)" = "$dl0" ] || { echo "pg_stat_database.deadlocks aumentou: $dl0 -> $(deadlocks)" >&2; exit 1; }
[ "$(queue_state)" = "$q0" ] || { echo "Fila de solicitações/ofertas mudou durante as corridas: $q0 -> $(queue_state)" >&2; exit 1; }
[ "$(dupq_count)" -le "$dupq0" ] || { echo "A corrida criou posições duplicadas na fila de instrutores" >&2; exit 1; }
echo "PASS: ${ROUNDS}x corrida 6 args vs 5 args (uma reserva) e ${ROUNDS}x aluno com aulas sobrepostas pagas juntas (uma confirmada, conflito do aluno na outra), sem deadlock, sem órfãs e com a fila intacta"
