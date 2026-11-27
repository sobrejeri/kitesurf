#!/usr/bin/env bash
# #90 — Ensaio, em PostgreSQL descartável, de: (A) exportação do backup lógico, (B) restauração local com conferência, (C) rollback exato de create_booking
# (assinaturas, defaults, corpo, definer, search_path, dono, ACL), (D) recusas fail-closed e (E) nova aplicação depois do rollback.
# Nada toca em Supabase real. Rode como usuário não-root com LANG=C.UTF-8.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/test-90-source-guard.sh"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
[ "$(id -u)" != "0" ] || { echo "Rode como usuário não-root." >&2; exit 1; }
W="$(mktemp -d)"; A="$W/src"; PA="${PORT_A:-54801}"
trap '"$PG_BIN/pg_ctl" -D "$A" -m immediate stop >/dev/null 2>&1 || true; "$PG_BIN/pg_ctl" -D "$W/rst" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$W"' EXIT
"$PG_BIN/initdb" -D "$A" -U postgres --auth=trust -E UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$A" -o "-p $PA -k $A -c listen_addresses=''" -w start >/dev/null
Q=(psql -X -h "$A" -p "$PA" -U postgres -d postgres -v ON_ERROR_STOP=1 -q); S=("${Q[@]}" -At)
M="$ROOT/supabase/migrations"
"${Q[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql" >/dev/null
"${Q[@]}" -c "do \$\$ begin create role service_role nologin; exception when duplicate_object then null; end \$\$;"
"${Q[@]}" -c "create schema supabase_migrations" -c "create table supabase_migrations.schema_migrations(version text primary key, name text)"
for m in "$M"/*.sql; do v="$(basename "$m" | cut -d_ -f1)"; [[ "$v" < "20261116160000" ]] || continue; "${Q[@]}" -1 -f "$m" >/dev/null 2>&1; done
"${Q[@]}" -f "$ROOT/supabase/tests/10_rules.test.sql" >/dev/null   # dados de reserva de teste, ainda com a função original do repositório
# Estado do projeto REAL (D2/D6/D7): 5 args DEFINER legado (1 default) e 6 args com 2 defaults, sem revalidação; ACLs como no Supabase (service_role e authenticated com EXECUTE; anon sem).
"${Q[@]}" >/dev/null <<'SQL'
create function public.create_booking(p_beach_id uuid, p_level public.lesson_level, p_language text, p_meetings jsonb, p_partner_code text default null)
returns uuid language plpgsql security definer set search_path = '' as $$ begin raise exception 'legacy'; end $$;
revoke all on function public.create_booking(uuid, public.lesson_level, text, jsonb, text) from public, anon;
grant execute on function public.create_booking(uuid, public.lesson_level, text, jsonb, text) to authenticated, service_role;
revoke all on function public.create_booking(uuid, public.lesson_level, text, jsonb, text, boolean) from public, anon;
grant execute on function public.create_booking(uuid, public.lesson_level, text, jsonb, text, boolean) to authenticated, service_role;
comment on function public.create_booking(uuid, public.lesson_level, text, jsonb, text, boolean) is 'original 6 args';
insert into supabase_migrations.schema_migrations values ('20261115100000','x');
SQL
state() { "${S[@]}" -c "select p.oid::regprocedure||'|'||md5(p.prosrc)||'|'||p.pronargdefaults||'|'||p.prosecdef||'|'||coalesce(p.proconfig::text,'')||'|'||pg_get_userbyid(p.proowner)||'|'||(select string_agg(x::text, ',' order by x::text) from unnest(coalesce(p.proacl, acldefault('f', p.proowner))) x)||'|'||pg_get_function_arguments(p.oid)||'|'||coalesce(obj_description(p.oid,'pg_proc'),'') from pg_proc p where p.proname='create_booking' and p.pronamespace='public'::regnamespace order by 1"; }
BEFORE="$(state)"; echo "estado original de create_booking:"; echo "$BEFORE" | cut -c1-150
BOOKINGS_BEFORE="$("${S[@]}" -f "$ROOT/scripts/ops/90-booking-fingerprint.sql")"

echo "== A. exportação do backup lógico =="
export PGHOST="$A" PGPORT="$PA" PGUSER=postgres PGDATABASE=postgres
OUT="$W/bkp"
# recusas fail-closed
! OUT_DIR="$OUT" CONFIRM_READONLY_EXPORT=sim EXPECTED_PROJECT_REF=qadkqjfmmnxvovyyhqxw bash "$ROOT/scripts/ops/90-export-logical-backup.sh" >/dev/null 2>&1 || { echo "FAIL: exportou de origem local sem ALLOW_LOCAL_SOURCE"; exit 1; }
! OUT_DIR="$W/b2" CONFIRM_READONLY_EXPORT=nao ALLOW_LOCAL_SOURCE=1 EXPECTED_PROJECT_REF=qadkqjfmmnxvovyyhqxw bash "$ROOT/scripts/ops/90-export-logical-backup.sh" >/dev/null 2>&1 || { echo "FAIL: exportou sem confirmação"; exit 1; }
! OUT_DIR="$ROOT/_nao_pode" CONFIRM_READONLY_EXPORT=sim ALLOW_LOCAL_SOURCE=1 EXPECTED_PROJECT_REF=qadkqjfmmnxvovyyhqxw bash "$ROOT/scripts/ops/90-export-logical-backup.sh" >/dev/null 2>&1 || { echo "FAIL: exportou para dentro do repositório"; exit 1; }
! PGHOST=db.outroprojeto.supabase.co OUT_DIR="$W/b3" CONFIRM_READONLY_EXPORT=sim EXPECTED_PROJECT_REF=qadkqjfmmnxvovyyhqxw bash "$ROOT/scripts/ops/90-export-logical-backup.sh" >/dev/null 2>&1 || { echo "FAIL: aceitou host de outro projeto"; exit 1; }
echo "PASS: recusas (origem local sem permissão, sem confirmação, dentro do repositório, outro projeto)"
OUT_DIR="$OUT" CONFIRM_READONLY_EXPORT=sim ALLOW_LOCAL_SOURCE=1 EXPECTED_PROJECT_REF=qadkqjfmmnxvovyyhqxw bash "$ROOT/scripts/ops/90-export-logical-backup.sh" | tail -6
[ "$(stat -c %a "$OUT")" = "700" ] || { echo "FAIL: pasta do backup deveria ser 700"; exit 1; }
! grep -q '@' "$OUT/auth_user_ids.csv" || { echo "FAIL: e-mail no CSV de ids"; exit 1; }

echo "== B. restauração local =="
BACKUP_DIR="$OUT" RESTORE_DIR="$W/rst" PORT=54802 bash "$ROOT/scripts/ops/90-restore-local.sh" | grep -E "PASS|FAIL"
cp -r "$OUT" "$W/bkp_ruim"; printf 'x' >> "$W/bkp_ruim/public.dump"
if BACKUP_DIR="$W/bkp_ruim" RESTORE_DIR="$W/rst2" PORT=54803 bash "$ROOT/scripts/ops/90-restore-local.sh" >/dev/null 2>&1; then echo "FAIL: restaurou dump adulterado"; exit 1; fi
echo "PASS: dump adulterado é recusado pelo SHA-256"

echo "== C. captura do rollback, aplicação da cadeia e rollback =="
OUT_FILE="$W/rollback_90.sql" CONFIRM_READONLY_EXPORT=sim ALLOW_LOCAL_SOURCE=1 EXPECTED_PROJECT_REF=qadkqjfmmnxvovyyhqxw bash "$ROOT/scripts/ops/90-capture-rollback.sh"
for f in 20261116160000_create_booking_legacy_safe_delegate 20261116170000_create_booking_six_args_no_defaults 20261124080301_guard_request_distinct_civil_days; do "${Q[@]}" -1 -f "$M/$f.sql" >/dev/null 2>&1; v="${f%%_*}"; "${Q[@]}" -c "insert into supabase_migrations.schema_migrations values ('$v','x')"; done
AFTER_APPLY="$(state)"; [ "$AFTER_APPLY" != "$BEFORE" ] || { echo "FAIL: a cadeia não alterou create_booking"; exit 1; }
"${S[@]}" -c "select count(*) from pg_trigger where tgname='request_00_distinct_civil_days'" | grep -qx 1
"${Q[@]}" -f "$ROOT/supabase/reconciliation/90_request_distinct_civil_days.test.sql" | grep -q PASS
# adulterar a captura: o rollback deve abortar sem mudar nada
sed "0,/if got is distinct from /s//if got is distinct from 'adulterado'||/" "$W/rollback_90.sql" > "$W/rollback_ruim.sql"
if "${Q[@]}" -f "$W/rollback_ruim.sql" >/dev/null 2>&1; then echo "FAIL: rollback adulterado foi aceito"; exit 1; fi
[ "$(state)" = "$AFTER_APPLY" ] || { echo "FAIL: rollback abortado deixou resíduo"; exit 1; }
echo "PASS: rollback com conferência divergente aborta sem mudar nada"
"${Q[@]}" -f "$W/rollback_90.sql" >/dev/null
[ "$(state)" = "$BEFORE" ] || { echo "FAIL: estado após rollback difere do original"; diff <(echo "$BEFORE") <(state); exit 1; }
echo "PASS: rollback devolveu assinaturas, defaults, corpo, definer, search_path, dono, ACL e comentário idênticos ao original"
[ "$("${S[@]}" -c "select count(*) from pg_trigger where tgname='request_00_distinct_civil_days'")" = "0" ] && [ "$("${S[@]}" -c "select to_regprocedure('public.guard_request_distinct_civil_days()') is null")" = "t" ]
[ "$("${S[@]}" -c "select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations")" = "20261115100000" ] || { echo "FAIL: ledger"; exit 1; }
echo "PASS: gatilho e função do guard removidos; ledger voltou a só o registro anterior"
# Compara o conteúdo completo capturado ANTES da aplicação, não uma contagem consigo mesma.
BOOKINGS_AFTER="$("${S[@]}" -f "$ROOT/scripts/ops/90-booking-fingerprint.sql")"
[ "$BOOKINGS_AFTER" = "$BOOKINGS_BEFORE" ] || { echo "FAIL: reservas ou encontros mudaram durante o ensaio rollback" >&2; exit 1; }
echo "PASS: reservas e encontros preservados (conteúdo completo e contagem)"
echo "== E. reaplicação depois do rollback =="
for f in 20261116160000_create_booking_legacy_safe_delegate 20261116170000_create_booking_six_args_no_defaults 20261124080301_guard_request_distinct_civil_days; do "${Q[@]}" -1 -f "$M/$f.sql" >/dev/null 2>&1; done
[ "$(state)" = "$AFTER_APPLY" ] || { echo "FAIL: reaplicação difere da primeira"; exit 1; }
"${Q[@]}" -f "$ROOT/supabase/reconciliation/90_request_distinct_civil_days.test.sql" | grep -q PASS
echo "PASS: reaplicar a cadeia após o rollback reproduz exatamente o estado da primeira aplicação"
echo "PASS: ensaio #90 (exportação, restauração, rollback exato, recusas, reaplicação)"
