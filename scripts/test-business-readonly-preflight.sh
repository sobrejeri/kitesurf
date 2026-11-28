#!/usr/bin/env bash
# Negative checks ONLY inside the temporary cluster created by test-db.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${PG_TEST_SOCKET:?Requires the disposable test-db.sh Unix socket}"
: "${PG_TEST_PORT:?Requires the disposable test-db.sh port}"
[[ "$PG_TEST_SOCKET" = /* && -f "$PG_TEST_SOCKET/PG_VERSION" && -S "$PG_TEST_SOCKET/.s.PGSQL.$PG_TEST_PORT" ]] || {
  echo 'Refusing: not the local disposable PostgreSQL data/socket directory' >&2
  exit 1
}
PSQL=(psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
CHECK="$ROOT/docs/proposals/business-multiempresa/VERIFICACAO_consolidada_somente_leitura.sql"
LOG="$(mktemp)"
restore() {
  "${PSQL[@]}" -c 'ALTER TABLE public.company_audit_logs ENABLE TRIGGER company_audit_append_only;' >/dev/null
  "${PSQL[@]}" -c "ALTER FUNCTION public.company_public_limits() SET search_path = '';" >/dev/null
  rm -f "$LOG"
}
trap restore EXIT
expect_rejection() {
  local expected_message="$1"
  if "${PSQL[@]}" -f "$CHECK" >"$LOG" 2>&1; then
    echo 'Preflight incorrectly accepted the altered disposable catalogue' >&2
    cat "$LOG" >&2
    exit 1
  fi
  if ! grep -Fq "$expected_message" "$LOG"; then
    echo 'Preflight failed for an unexpected reason' >&2
    cat "$LOG" >&2
    exit 1
  fi
}
"${PSQL[@]}" -f "$CHECK"
"${PSQL[@]}" -c 'ALTER TABLE public.company_audit_logs ENABLE REPLICA TRIGGER company_audit_append_only;'
expect_rejection 'Missing or non-origin trigger: company_audit_append_only'
echo 'PASS: Business preflight rejects ENABLE REPLICA trigger in normal sessions'
"${PSQL[@]}" -c 'ALTER TABLE public.company_audit_logs ENABLE ALWAYS TRIGGER company_audit_append_only;'
"${PSQL[@]}" -f "$CHECK"
"${PSQL[@]}" -c 'ALTER TABLE public.company_audit_logs ENABLE TRIGGER company_audit_append_only;'
"${PSQL[@]}" -c 'ALTER FUNCTION public.company_public_limits() SET search_path = public;'
expect_rejection 'Unexpected function signature/security/search_path: company_public_limits'
echo 'PASS: Business preflight rejects an explicitly unsafe search_path'
"${PSQL[@]}" -c "ALTER FUNCTION public.company_public_limits() SET search_path = '';"
"${PSQL[@]}" -f "$CHECK"
echo 'PASS: Business preflight accepts origin/always triggers and restored empty search_path'
