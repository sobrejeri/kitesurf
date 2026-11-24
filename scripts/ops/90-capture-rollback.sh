#!/usr/bin/env bash
# #90 — Gera o rollback exato de create_booking ANTES de aplicar. Somente leitura no banco; grava o script em OUT_FILE (fora do repositório).
# Conexão pelas variáveis padrão do libpq (como no export). Exige EXPECTED_PROJECT_REF e CONFIRM_READONLY_EXPORT=sim.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
: "${OUT_FILE:?}"; [ ! -e "$OUT_FILE" ] || { echo "OUT_FILE já existe." >&2; exit 2; }
[ "${CONFIRM_READONLY_EXPORT:-}" = "sim" ] || { echo "Defina CONFIRM_READONLY_EXPORT=sim." >&2; exit 2; }
REF="${EXPECTED_PROJECT_REF:?}"; HOST="${PGHOST:-}"
if [[ "$HOST" == /* ]]; then [ "${ALLOW_LOCAL_SOURCE:-}" = "1" ] || { echo "Origem local só com ALLOW_LOCAL_SOURCE=1." >&2; exit 2; }
else case "$HOST${PGUSER:-}" in *"$REF"*) ;; *) echo "Host/usuário sem a referência $REF: recusado." >&2; exit 2;; esac; fi
case "$(cd "$(dirname "$OUT_FILE")" && pwd)" in "$ROOT"|"$ROOT"/*) echo "OUT_FILE dentro do repositório: recusado." >&2; exit 2;; esac
export PGOPTIONS="-c default_transaction_read_only=on"
umask 077
psql -X -At -v ON_ERROR_STOP=1 -f "$ROOT/scripts/ops/90-capture-rollback.sql" > "$OUT_FILE"
echo "OK: rollback gerado em $OUT_FILE ($(grep -c . "$OUT_FILE") linhas). Guarde fora do GitHub."
