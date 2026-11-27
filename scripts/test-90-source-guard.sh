#!/usr/bin/env bash
# Offline source validation only: no PostgreSQL binaries or network required.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GUARD="$ROOT/scripts/ops/90-source-guard.sh"
base=(env -i "PATH=$PATH" EXPECTED_PROJECT_REF=qadkqjfmmnxvovyyhqxw PGDATABASE=postgres PGPORT=5432)
accept() { "${base[@]}" "$@" bash "$GUARD"; }
reject() { if "${base[@]}" "$@" bash "$GUARD" >/dev/null 2>&1; then echo 'FAIL: unsafe source accepted' >&2; exit 1; fi; }
accept PGHOST=db.qadkqjfmmnxvovyyhqxw.supabase.co
accept PGHOST=aws-0-sa-east-1.pooler.supabase.com PGUSER=postgres.qadkqjfmmnxvovyyhqxw
accept PGHOST=/tmp/local-test ALLOW_LOCAL_SOURCE=1 PGPORT=54801
reject EXPECTED_PROJECT_REF=other PGHOST=db.other.supabase.co
reject PGHOST=db.qadkqjfmmnxvovyyhqxw.supabase.co.evil.test
reject PGHOST=evil.test PGUSER=postgres.qadkqjfmmnxvovyyhqxw
reject PGHOST=aws-0-sa-east-1.pooler.supabase.com PGUSER=postgres.other
reject PGHOST=db.qadkqjfmmnxvovyyhqxw.supabase.co PGHOSTADDR=127.0.0.1
reject PGHOST=db.qadkqjfmmnxvovyyhqxw.supabase.co PGSERVICE=other
reject PGHOST=db.qadkqjfmmnxvovyyhqxw.supabase.co PGSERVICEFILE=/tmp/other
reject PGHOST=db.qadkqjfmmnxvovyyhqxw.supabase.co PGDATABASE=postgresql://evil.test/postgres
reject PGHOST=/tmp/local-test ALLOW_LOCAL_SOURCE=1 PGDATABASE=postgresql://evil.test/postgres
reject PGHOST=db.qadkqjfmmnxvovyyhqxw.supabase.co PGPORT=6543
reject PGHOST=/tmp/local-test
reject PGHOST=/tmp/nonexistent,db.other.supabase.co ALLOW_LOCAL_SOURCE=1
reject PGHOST=/tmp/local-test,db.qadkqjfmmnxvovyyhqxw.supabase.co ALLOW_LOCAL_SOURCE=1
reject PGHOST=/tmp/local-test ALLOW_LOCAL_SOURCE=1 PGPORT=54801,5432
reject PGHOST=db.qadkqjfmmnxvovyyhqxw.supabase.co,db.other.supabase.co
reject PGHOST=db.qadkqjfmmnxvovyyhqxw.supabase.co PGPORT=5432,5432
W="$(mktemp -d)"
trap 'rm -rf "$W"' EXIT
mkdir "$W/bin" "$W/backup"
for cmd in initdb pg_ctl pg_restore; do
  cat > "$W/bin/$cmd" <<'CANARY'
#!/usr/bin/env bash
echo invoked >> "$CANARY_FILE"
exit 99
CANARY
  chmod +x "$W/bin/$cmd"
done
printf '#!/usr/bin/env bash\nexit 0\n' > "$W/bin/sha256sum"
chmod +x "$W/bin/sha256sum"
for alternate in PGHOSTADDR=127.0.0.1 PGSERVICE=other PGSERVICEFILE=/tmp/other; do
  if env -i "PATH=$W/bin:$PATH" "BACKUP_DIR=$W/backup" "RESTORE_DIR=$W/restore" "PG_BIN=$W/bin" "CANARY_FILE=$W/invoked" "$alternate" \
      bash "$ROOT/scripts/ops/90-restore-local.sh" >/dev/null 2>&1; then echo 'FAIL: restore accepted libpq override' >&2; exit 1; fi
done
[[ ! -e "$W/invoked" ]] || { echo 'FAIL: PostgreSQL command ran before restore guard' >&2; exit 1; }
restore_guard="$ROOT/scripts/ops/90-restore-target-guard.sh"
env -i "PATH=$PATH" BACKUP_DIR=/tmp/backup RESTORE_DIR=/tmp/restore PORT=54802 bash "$restore_guard"
for bad in 'RESTORE_DIR=/tmp/local,remote' 'RESTORE_DIR=/tmp/space dir' 'PORT=54802,5432' 'PORT=99999'; do
  if env -i "PATH=$PATH" BACKUP_DIR=/tmp/backup RESTORE_DIR=/tmp/restore "$bad" bash "$restore_guard" >/dev/null 2>&1; then echo 'FAIL: restore accepted unsafe target' >&2; exit 1; fi
done
mkdir "$W/existing"
printf 'preserve\n' > "$W/existing/sentinel"
# The old mkdir -p followed by cleanup resolved this target to existing/.
if env -i "PATH=$W/bin:$PATH" "BACKUP_DIR=$W/backup" "RESTORE_DIR=$W/missing/../existing" "PG_BIN=$W/bin" "CANARY_FILE=$W/invoked" \
    bash "$ROOT/scripts/ops/90-restore-local.sh" >/dev/null 2>&1; then echo 'FAIL: restore accepted traversal' >&2; exit 1; fi
[[ -f "$W/existing/sentinel" && ! -e "$W/invoked" ]] || { echo 'FAIL: traversal affected preexisting data or ran PostgreSQL' >&2; exit 1; }
ln -s "$W/existing" "$W/linked-parent"
# Canonical parent symlinks are safe: only a fresh mktemp child can be cleaned.
if env -i "PATH=$W/bin:$PATH" "BACKUP_DIR=$W/backup" "RESTORE_DIR=$W/linked-parent/newcluster" "PG_BIN=$W/bin" "CANARY_FILE=$W/invoked" \
    bash "$ROOT/scripts/ops/90-restore-local.sh" >/dev/null 2>&1; then echo 'FAIL: inert initdb unexpectedly succeeded' >&2; exit 1; fi
[[ -f "$W/existing/sentinel" && -f "$W/invoked" ]] || { echo 'FAIL: parent-symlink rehearsal did not preserve sentinel' >&2; exit 1; }
[[ -z "$(find "$W/existing" -maxdepth 1 -name 'newcluster.*' -print)" ]] || { echo 'FAIL: owned temporary cluster not cleaned' >&2; exit 1; }
printf '%s\n' 'PASS: Kitesurf direct/pooler/local source checks reject alternate projects and libpq overrides (offline)'
