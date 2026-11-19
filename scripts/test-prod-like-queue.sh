#!/usr/bin/env bash
# #92: a cadeia da PR #300 e o job de expiração precisam funcionar no estado em que o projeto REAL está, e não só no do repositório.
# D7 (19/11/2026) mostrou que, em produção, advance_instructor_offer está na versão da migration 14: as migrations 20261113000043 e
# 20261114002000 (instrutor preferido) NÃO estão aplicadas. Este teste monta um banco SEM essas duas e roda os testes de fila e do job.
# Cluster próprio e descartável; não toca em nenhum Supabase.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
[ "$(id -u)" != "0" ] || { echo "Rode como usuário não-root." >&2; exit 1; }
D="$(mktemp -d)"; P="${PORT_C:-54663}"
trap '"$PG_BIN/pg_ctl" -D "$D" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
"$PG_BIN/initdb" -D "$D" -U postgres --auth=trust >/dev/null; "$PG_BIN/pg_ctl" -D "$D" -o "-p $P -k $D -c listen_addresses=''" -w start >/dev/null
Q=(psql -h "$D" -p "$P" -U postgres -d postgres -v ON_ERROR_STOP=1 -q); A=("${Q[@]}" -At)
"${Q[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for m in "$ROOT"/supabase/migrations/*.sql; do
  case "$m" in *20261113000043*|*20261114002000*) continue;; esac     # estado de producao: sem o instrutor preferido
  "${Q[@]}" -1 -f "$m" >/dev/null 2>&1 || { echo "FALHA ao aplicar $(basename "$m") no estado de producao" >&2; exit 1; }
done
# a versao de advance_instructor_offer tem que ser a de producao (hash normalizado do corpo, sem comentarios nem espacos)
h="$("${A[@]}" -c "select md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) from pg_proc p where p.oid = 'public.advance_instructor_offer(uuid)'::regprocedure")"
[ "$h" = "07ba8bce57117edfd686b668306a9ea7" ] || { echo "fixture invalido: advance_instructor_offer nao esta na versao da migration 14 ($h)" >&2; exit 1; }
"${Q[@]}" -f "$ROOT/supabase/tests/10_rules.test.sql" >/dev/null
for t in test-offer-queue-edges.sh test-offer-queue-abc.sh test-offer-offline-executor.sh; do
  PG_TEST_SOCKET="$D" PG_TEST_PORT="$P" bash "$ROOT/scripts/$t" >/dev/null 2>"$D/err" || { echo "FALHOU no estado de producao: $t" >&2; cat "$D/err" >&2; exit 1; }
done
"${Q[@]}" -f "$ROOT/supabase/tests/89h_change_windows_and_incident.test.sql" >/dev/null 2>"$D/err" || { echo "FALHOU no estado de producao: 89h" >&2; cat "$D/err" >&2; exit 1; }
echo "PASS: no estado de producao (advance_instructor_offer = migration 14, sem as migrations do instrutor preferido) a fila, o A->B->C offline, o job e as janelas 12h+12h passam"
