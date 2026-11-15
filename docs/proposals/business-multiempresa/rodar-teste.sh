#!/usr/bin/env bash
# Valida a PROPOSTA em um PostgreSQL descartável: aplica todas as migrations
# reais, depois o rascunho, depois o teste. Não toca em nada fora de um
# diretório temporário. Precisa de PostgreSQL 15+ e de usuário não root.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HERE="$ROOT/docs/proposals/business-multiempresa"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
DATA="$(mktemp -d)"; PORT="${PORT:-54339}"
trap '"$PG_BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT
[ "$(id -u)" != "0" ] || { echo "Rode como usuário não root." >&2; exit 1; }
"$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -w start >/dev/null
PSQL=(psql -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for m in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -1 -f "$m" >/dev/null; done
"${PSQL[@]}" -1 -f "$HERE/PROPOSTA_fase1_empresa_equipe_instrutores.sql"
"${PSQL[@]}" -f "$HERE/PROPOSTA_fase1.test.sql"
