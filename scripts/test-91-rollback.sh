#!/usr/bin/env bash
# #91 — Ensaio (PostgreSQL descartável) do rollback da migration 20261125100000: captura -> aplica -> rollback devolve as cinco funções (corpo, definer, search_path, dono, ACL),
# remove gatilhos/funções novos, preserva as tabelas novas e os dados das reservas; rollback adulterado aborta sem mudar nada; reaplicar reproduz o mesmo estado.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
[ "$(id -u)" != "0" ] || { echo "Rode como usuário não-root." >&2; exit 1; }
A="$(mktemp -d)"; PA="${PORT_A:-54811}"
trap '"$PG_BIN/pg_ctl" -D "$A" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$A"' EXIT
"$PG_BIN/initdb" -D "$A" -U postgres --auth=trust -E UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$A" -o "-p $PA -k $A -c listen_addresses=''" -w start >/dev/null
Q=(psql -X -h "$A" -p "$PA" -U postgres -d postgres -v ON_ERROR_STOP=1 -q); S=("${Q[@]}" -At)
V2="20261125100000"
"${Q[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql" >/dev/null
"${Q[@]}" -c "do \$\$ begin create role service_role nologin; exception when duplicate_object then null; end \$\$;" -c "create schema supabase_migrations" -c "create table supabase_migrations.schema_migrations(version text primary key, name text)"
for m in "$ROOT"/supabase/migrations/*.sql; do v="$(basename "$m" | cut -d_ -f1)"; [[ "$v" < "$V2" ]] || continue; "${Q[@]}" -1 -f "$m" >/dev/null 2>&1; done
"${Q[@]}" -f "$ROOT/supabase/tests/10_rules.test.sql" >/dev/null
"${Q[@]}" -c "insert into supabase_migrations.schema_migrations values ('20261124080301','x')"
state() { "${S[@]}" -c "select p.oid::regprocedure||'|'||md5(p.prosrc)||'|'||p.prosecdef||'|'||coalesce(p.proconfig::text,'')||'|'||pg_get_userbyid(p.proowner)||'|'||(select string_agg(x::text, ',' order by x::text) from unnest(coalesce(p.proacl, acldefault('f', p.proowner))) x) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('instructor_can_attend','can_move_meeting','save_my_schedule','block_my_time','unblock_my_time') order by 1"; }
data() { "${S[@]}" -c "select (select count(*) from public.bookings)||'/'||(select count(*) from public.booking_meetings)||'/'||coalesce((select md5(string_agg(md5(row_to_json(b)::text), ',' order by b.id)) from public.bookings b),'-')"; }
BEFORE="$(state)"; D0="$(data)"; [ "$(echo "$BEFORE" | wc -l)" = 5 ] || { echo "FAIL: esperava 5 funções no estado original"; exit 1; }
RB="$A/rollback_91.sql"
"${S[@]}" -f "$ROOT/scripts/ops/91-capture-rollback.sql" > "$RB"
"${Q[@]}" -1 -f "$ROOT/supabase/migrations/$V2"_instructor_schedule_v2.sql >/dev/null 2>&1
"${Q[@]}" -c "insert into supabase_migrations.schema_migrations values ('$V2','x')"
AFTER="$(state)"; [ "$AFTER" != "$BEFORE" ] || { echo "FAIL: a migration não alterou as funções"; exit 1; }
# dados novos que o rollback NÃO pode apagar
"${Q[@]}" -c "insert into public.instructor_schedule_settings(instructor_id,buffer_minutes) values ('00000000-0000-0000-0000-0000000000a1',0) on conflict do nothing" -c "insert into public.instructor_weekly_breaks(instructor_id,weekday,starts_at,ends_at) values ('00000000-0000-0000-0000-0000000000a1',1,'12:00','13:00')"
sed "0,/if got is distinct from /s//if got is distinct from 'adulterado'||/" "$RB" > "$A/rollback_ruim.sql"
if "${Q[@]}" -f "$A/rollback_ruim.sql" >/dev/null 2>&1; then echo "FAIL: rollback adulterado aceito"; exit 1; fi
[ "$(state)" = "$AFTER" ] || { echo "FAIL: rollback abortado deixou resíduo"; exit 1; }
echo "PASS: rollback com conferência divergente aborta sem mudar nada"
"${Q[@]}" -f "$RB" >/dev/null
[ "$(state)" = "$BEFORE" ] || { echo "FAIL: funções após rollback diferem do original"; diff <(echo "$BEFORE") <(state); exit 1; }
echo "PASS: rollback devolveu as 5 funções (corpo, definer, search_path, dono, ACL) idênticas ao original"
[ "$("${S[@]}" -c "select count(*) from pg_trigger where tgname in ('guard_instructor_meeting_overlap_insert_update','guard_instructor_booking_change_update')")" = 0 ]
[ "$("${S[@]}" -c "select to_regprocedure('public.instructor_slot_open(uuid,timestamptz,timestamptz)') is null")" = t ]
[ "$("${S[@]}" -c "select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations")" = "20261124080301" ] || { echo "FAIL: ledger"; exit 1; }
[ "$(data)" = "$D0" ] || { echo "FAIL: dados de reservas mudaram"; exit 1; }
[ "$("${S[@]}" -c "select count(*) from public.instructor_weekly_breaks")" = 1 ] || { echo "FAIL: dados das tabelas novas foram apagados"; exit 1; }
echo "PASS: gatilhos e funções novos removidos; ledger e reservas intactos; dados das tabelas aditivas preservados"
"${Q[@]}" -c "delete from public.instructor_weekly_breaks" -c "delete from public.instructor_schedule_settings where instructor_id='00000000-0000-0000-0000-0000000000a1'" >/dev/null 2>&1 || true
# a migration não é reaplicável por cima das tabelas novas (CREATE TABLE sem IF NOT EXISTS): a reaplicação exige remover as aditivas, como num clone limpo
"${Q[@]}" -c "drop table public.instructor_weekly_breaks, public.instructor_extra_hours" -c "alter table public.instructor_time_off drop column kind"
"${Q[@]}" -1 -f "$ROOT/supabase/migrations/$V2"_instructor_schedule_v2.sql >/dev/null 2>&1
[ "$(state)" = "$AFTER" ] || { echo "FAIL: reaplicação difere da primeira"; exit 1; }
echo "PASS: reaplicar a migration após o rollback reproduz o mesmo estado"
echo "PASS: ensaio de rollback #91"
