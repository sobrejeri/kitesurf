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
printf '%s\n' 'PASS: Kitesurf direct/pooler/local source checks reject alternate projects and libpq overrides (offline)'
