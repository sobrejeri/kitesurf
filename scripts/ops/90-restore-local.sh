#!/usr/bin/env bash
# #90 — Restaura o backup lógico (pasta gerada por 90-export-logical-backup.sh) em PostgreSQL LOCAL e descartável, só por socket Unix.
# Sem rede, sem contratar nada. Confere o SHA-256 antes de restaurar e compara as impressões digitais depois.
# Uso: BACKUP_DIR=<pasta do export> RESTORE_DIR=<pasta nova para o cluster local> bash scripts/ops/90-restore-local.sh
#   RESTORE_DIR é prefixo; o alvo efetivo recebe sufixo aleatório e é informado ao final.
#   KEEP_RUNNING=1 deixa o cluster no ar; use o caminho efetivo informado para parar/apagar.
# Exige PostgreSQL 15+ (de preferência a mesma versão principal do servidor, ver manifest.txt) e usuário NÃO-root. Use LANG=C.UTF-8.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
: "${BACKUP_DIR:?}" "${RESTORE_DIR:?}"
source "$ROOT/scripts/ops/90-restore-target-guard.sh"
guard_local_restore_target
[ "$(id -u)" != "0" ] || { echo "Rode como usuário não-root." >&2; exit 2; }
[ -d "$BACKUP_DIR" ] || { echo "BACKUP_DIR inexistente." >&2; exit 2; }
[ ! -e "$RESTORE_DIR" ] || { echo "RESTORE_DIR já existe: use uma pasta nova." >&2; exit 2; }
RESTORE_PARENT="$(realpath -e -- "$(dirname -- "$RESTORE_DIR")")"
[ -d "$RESTORE_PARENT" ] || { echo 'Parent local de restore inexistente.' >&2; exit 2; }
RESTORE_PREFIX="$RESTORE_PARENT/$(basename -- "$RESTORE_DIR")"
RESTORE_DIR="$RESTORE_PREFIX"
BACKUP_DIR="$(realpath -e -- "$BACKUP_DIR")"
# A simple symlink input may resolve to a path containing unsafe characters.
guard_local_restore_target
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
PORT="${PORT:-54790}"
( cd "$BACKUP_DIR" && sha256sum -c sha256.txt ) || { echo "SHA-256 não confere: backup corrompido ou alterado. Parei." >&2; exit 1; }
umask 077
RESTORE_DIR="$(mktemp -d -- "$RESTORE_PREFIX.XXXXXXXX")"
OWNED_RESTORE_DIR="$RESTORE_DIR"
OWNED_RESTORE_ID="$(stat -Lc '%d:%i' -- "$OWNED_RESTORE_DIR")"
KEEP="${KEEP_RUNNING:-0}"
cleanup() {
  if [ "$KEEP" != "1" ] || [ "${OK:-0}" != "1" ]; then
    # Never stop or remove a substituted path or a preexisting directory.
    if [ ! -L "$OWNED_RESTORE_DIR" ] && [ -d "$OWNED_RESTORE_DIR" ] && [ "$(stat -Lc '%d:%i' -- "$OWNED_RESTORE_DIR" 2>/dev/null)" = "$OWNED_RESTORE_ID" ]; then
      "$PG_BIN/pg_ctl" -D "$OWNED_RESTORE_DIR" -m immediate stop >/dev/null 2>&1 || true
      rm -rf -- "$OWNED_RESTORE_DIR"
    fi
  fi
}
trap cleanup EXIT
"$PG_BIN/initdb" -D "$RESTORE_DIR" -U postgres --auth=trust -E UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$RESTORE_DIR" -o "-p $PORT -k $RESTORE_DIR -c listen_addresses=''" -w start >/dev/null   # sem rede: só socket
Q=(psql -X -h "$RESTORE_DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${Q[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql"
"${Q[@]}" -c "do \$\$ begin create role service_role nologin; exception when duplicate_object then null; end \$\$;"
# Só os ids de auth.users (as chaves estrangeiras do schema public precisam deles); e-mail fictício, sem hash de senha.
"${Q[@]}" <<SQL
create temp table ids(id uuid);
\copy ids from '$BACKUP_DIR/auth_user_ids.csv' csv
insert into auth.users(id, email) select id, id::text || '@restore.invalid' from ids on conflict do nothing;
SQL
"${Q[@]}" -c "drop schema public cascade"   # o dump recria o schema public com as permissões originais
"$PG_BIN/pg_restore" -h "$RESTORE_DIR" -p "$PORT" -U postgres -d postgres --no-owner --exit-on-error "$BACKUP_DIR/public.dump"
FP="$(mktemp)"; trap 'rm -f "$FP"; cleanup' EXIT
"${Q[@]}" -At -f "$ROOT/scripts/ops/90-fingerprints.sql" > "$FP"
if diff -u "$BACKUP_DIR/fingerprints.txt" "$FP"; then echo "PASS: restauração idêntica ao original (reservas, encontros, pedidos, ofertas, preços, funções, políticas, gatilhos, RLS)"; else echo "FAIL: impressões digitais divergem" >&2; exit 1; fi
OK=1
[ "$KEEP" = "1" ] && echo "Cluster no ar: psql -h $RESTORE_DIR -p $PORT -U postgres -d postgres"
exit 0
