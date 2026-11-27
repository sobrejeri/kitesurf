#!/usr/bin/env bash
# Applies the Supabase migrations to a throwaway local PostgreSQL and runs the
# rule tests in supabase/tests. Needs PostgreSQL 15+ binaries on the machine;
# touches nothing outside a temporary directory.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
DATA="$(mktemp -d)"
PORT="${PORT:-54329}"
trap '"$PG_BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT

if [ "$(id -u)" = "0" ]; then
  echo "Run as a non-root user (PostgreSQL refuses to start as root)." >&2
  exit 1
fi

"$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -w start >/dev/null

PSQL=(psql -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for migration in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -1 -f "$migration"
done
"${PSQL[@]}" -f "$ROOT/supabase/tests/10_rules.test.sql"
# Run overlap regression while the two-meeting fixture from 10_rules is intact.
# Later stateful SQL tests may cancel or reschedule that booking.
"${PSQL[@]}" -f "$ROOT/supabase/tests/89a_student_overlap_behavior.test.sql"
for testfile in "$ROOT"/supabase/tests/[2-9]*.test.sql; do
  [ "$testfile" = "$ROOT/supabase/tests/89a_student_overlap_behavior.test.sql" ] && continue
  "${PSQL[@]}" -f "$testfile"
done

# Pagar.me bookkeeping races in this disposable cluster, before lesson races.
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-pagarme-attempt-concurrency.sh"

# Run the 4h/two-day input matrix before the stateful concurrency suites below
# consume the shared instructor's finite scheduling horizon. Its SQL transaction
# rolls all fixture changes back, so later tests see the same seed state.
"${PSQL[@]}" -f "$ROOT/supabase/reconciliation/90_request_input_guard.regression.sql"

# Run actual two-connection race only in this disposable database, after rule fixtures.
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-concurrent-instructor-booking.sh"

# Validate the core student flow: four scheduled hours split across two days.
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-booking-two-meetings.sh"

# Cover the student-facing request/offer path through both lessons and balance.
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-request-queue-two-meetings.sh"
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" PG_TEST_REQUEST_MODE=preferred bash "$ROOT/scripts/test-request-queue-two-meetings.sh"

# Bordas da fila (aceite fora do prazo, oferta alheia, esgotar elegíveis, aceite duplo, conflito do aluno no aceite).
# Roda ANTES do A->B->C, que cria um terceiro instrutor e mudaria a contagem de elegíveis.
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-offer-queue-edges.sh"

# A declines, B expires, C accepts in the same disposable database.
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-offer-queue-abc.sh"

# #92: ensaio do executor offline (3 instrutores, sem sessão aberta) e mesmo estado para Aluno, Instrutor e Admin. Depende do instrutor C acima.
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-offer-offline-executor.sh"

# Authorized postponement and cross-account denial in throwaway PostgreSQL.
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-meeting-change-auth.sh"

# The booking race is timing dependent: a single run catches a regression only some of the time.
# Run it again, many times, at the very end (each round books the next free pair of days for the
# same instructor with two simultaneous connections, so it must not run before the other flows
# that look for free days).
for round in $(seq 1 "${RACE_ROUNDS:-12}"); do
  PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-concurrent-instructor-booking.sh" >/dev/null 2>"$DATA/race.err" \
    || { echo "Concurrent booking race failed on round $round" >&2; cat "$DATA/race.err" >&2; exit 1; }
done
echo "PASS: ${RACE_ROUNDS:-12} repeated concurrent booking rounds, never two accepted bookings for one instructor and slot"

# P0 #90/#91: PRs #296 + #298 juntas. Dois alunos no mesmo horário (6 args vs 5 args) e um aluno pagando aulas
# sobrepostas ao mesmo tempo. Roda por último: consome dias livres do instrutor de fixture.
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-p0-booking-concurrency.sh"

# #92: um instrutor só com a linha travada na hora da solicitação (oferta nasce depois, sem esperar, sem duplicar).
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-single-instructor-request-lock.sh"

# P2-1: pagar uma reserva e criar outra com o mesmo instrutor (mesmo aluno) ao mesmo tempo não pode dar deadlock.
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-payment-lock-order.sh"

# #88: caminho de atualização por cima de um ambiente com a migration original já aplicada + backup/restauração (clusters próprios).
bash "$ROOT/scripts/test-migration-upgrade-path.sh"

# #92: a cadeia e o job também precisam passar no estado REAL do projeto (sem as migrations do instrutor preferido; D7 de 19/11/2026).
bash "$ROOT/scripts/test-prod-like-queue.sh"

# O script de ensaio da cadeia (scripts/rehearse-chain.sh) no estado real do projeto: feliz, recusa por ajuste manual e parada no primeiro erro.
bash "$ROOT/scripts/test-rehearse-chain.sh"

# #90: test the migration already loaded by the standard disposable migration loop.
"${PSQL[@]}" -f "$ROOT/supabase/reconciliation/90_request_distinct_civil_days.test.sql"

# #90: independently exercise installation and upgrade in disposable clusters.
bash "$ROOT/scripts/test-request-input-migration.sh"

# #96: real two-connection push lease/attempt race in this disposable cluster.
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-push-outbox-concurrency.sh"

# #96: gone settlement cannot block Auth logout; retire skipped targets later.
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-push-outbox-retirement.sh"

# #96: claim skips parent deletion rather than waiting on a recipient FK.
PG_TEST_SOCKET="$DATA" PG_TEST_PORT="$PORT" bash "$ROOT/scripts/test-push-outbox-profile-deletion.sh"

# #89: preserve both known payment-function baselines while rejecting NULL instructor.
bash "$ROOT/scripts/test-test-payment-instructor-migration.sh"
