#!/usr/bin/env bash
# #91 — teste de MUTAÇÃO do lock: remove da add_my_time_off o lock da linha do instrutor e exige que o cenário A de
# scripts/test-schedule-concurrency.sh FALHE (prova de que o teste detecta a falta do lock). Restaura a função ao final.
# Só roda no banco descartável do scripts/test-db.sh (último passo: a função é alterada e restaurada).
set -euo pipefail
: "${PG_TEST_SOCKET:?}"; : "${PG_TEST_PORT:?}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PSQL=(psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq)
SIG='public.add_my_time_off(timestamptz,timestamptz,text,text)'
orig="$(mktemp)"; trap '"${PSQL[@]}" -f "$orig" >/dev/null 2>&1 || true; rm -f "$orig"' EXIT
"${PSQL[@]}" -c "select pg_get_functiondef('$SIG'::regprocedure) || ';'" > "$orig"
grep -q "perform 1 from public.instructors where id = uid for update;" "$orig" || { echo "FAIL: não achei o lock da linha do instrutor em add_my_time_off" >&2; exit 1; }
sed 's/perform 1 from public.instructors where id = uid for update;/perform 1;/' "$orig" | "${PSQL[@]}" -f - >/dev/null
# com o lock removido o cenário A DEVE falhar, e pelo motivo certo: o bloqueio não ficou esperando a reserva (não pode ser falha de fixture)
if OFFSET_BASE=200 ONLY=A bash "$ROOT/scripts/test-schedule-concurrency.sh" >"$orig.mut.out" 2>&1; then
  echo "FAIL: sem o lock o cenário A deveria falhar (o teste não detecta a falta do lock)" >&2; cat "$orig.mut.out" >&2; exit 1
fi
grep -q "o bloqueio ficou ESPERANDO por lock\|o bloqueio deveria ser recusado por reserva em pagamento\|bloqueio criado junto com a reserva" "$orig.mut.out" || { echo "FAIL: o cenário A falhou por outro motivo (fixture?), não pela falta do lock:" >&2; cat "$orig.mut.out" >&2; exit 1; }
rm -f "$orig.mut.out"
"${PSQL[@]}" -f "$orig" >/dev/null
OFFSET_BASE=220 ONLY=A bash "$ROOT/scripts/test-schedule-concurrency.sh" >/dev/null || { echo "FAIL: com o lock restaurado o cenário A deveria passar" >&2; exit 1; }
echo "PASS: mutação — sem o lock da linha do instrutor o cenário A falha; com o lock restaurado passa"
