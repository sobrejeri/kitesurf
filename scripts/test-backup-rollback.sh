#!/usr/bin/env bash
# Lote de 10, item 2: BACKUP restaurável e ROLLBACK comprovados em PostgreSQL descartável (nunca em Supabase real).
#   1. Banco S0 = todas as migrations MENOS a da PR #323 (20261121120000) + dados de fixture. Fingerprint F0 (tabelas, colunas, funções, ACLs,
#      políticas, gatilhos, RLS, buckets) e contagens. pg_dump -Fc  => backup B0.
#   2. Aplica a migration da PR #323 (commit). O fingerprint MUDA (prova que o teste enxerga a migration); as contagens de dados não mudam.
#   3. RESTAURAÇÃO: B0 é restaurado num cluster novo: fingerprint e contagens IDÊNTICOS a F0 (backup anterior à migration devolve o estado exato).
#   4. REVERSÃO POR SQL: docs/rollback/20261121120000_down.sql aplicado sobre o banco migrado devolve fingerprint e contagens a F0.
#      O script recusa (sem alterar nada) se existir encontro interrompido, porque apagar as colunas perderia dados.
#   5. O arquivo down.sql é GERADO a partir de S0 (definições de start_ordered_meeting/start_meeting): se ele divergir, o teste falha.
#      Para regerar: WRITE_DOWN=1 scripts/test-backup-rollback.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
[ "$(id -u)" != "0" ] || { echo "Rode como usuário não-root (o PostgreSQL recusa root)." >&2; exit 1; }
TARGET="20261121120000_meeting_interruption_resume.sql"
# Migrations que DEPENDEM do alvo (colunas novas): ficam fora do estado anterior, entram depois do alvo e são revertidas pelo mesmo down.sql.
DEPENDENTS=("20261123130000_balance_minutes_count_resumed.sql")
is_dep() { local x; for x in "${DEPENDENTS[@]}"; do [ "$x" = "$1" ] && return 0; done; return 1; }
DOWN="$ROOT/docs/rollback/20261121120000_down.sql"
A="$(mktemp -d)"; B="$(mktemp -d)"; PA="${PORT_A:-54671}"; PB="${PORT_B:-54672}"
trap '"$PG_BIN/pg_ctl" -D "$A" -m immediate stop >/dev/null 2>&1 || true; "$PG_BIN/pg_ctl" -D "$B" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$A" "$B"' EXIT
start() { "$PG_BIN/initdb" -D "$1" -U postgres --auth=trust >/dev/null; "$PG_BIN/pg_ctl" -D "$1" -o "-p $2 -k $1 -c listen_addresses=''" -w start >/dev/null; }
start "$A" "$PA"; start "$B" "$PB"
QA=(psql -h "$A" -p "$PA" -U postgres -d postgres -v ON_ERROR_STOP=1 -q); QB=(psql -h "$B" -p "$PB" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
SA=("${QA[@]}" -At); SB=("${QB[@]}" -At)

"${QA[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for m in "$ROOT"/supabase/migrations/*.sql; do b="$(basename "$m")"; [ "$b" = "$TARGET" ] && continue; is_dep "$b" && continue; "${QA[@]}" -1 -f "$m" >/dev/null; done
"${QA[@]}" -f "$ROOT/supabase/tests/10_rules.test.sql" >/dev/null     # dados de reserva do fixture

fingerprint() { "$@" <<'SQL'
select 'tabelas:' || coalesce((select md5(string_agg(t || '=' || c, ',' order by t)) from (
  select table_schema || '.' || table_name as t,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text as c
  from information_schema.tables where table_type = 'BASE TABLE' and table_schema in ('public', 'auth', 'storage')) x), '-');
select 'colunas:' || md5(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), '|' order by table_name, column_name)) from information_schema.columns where table_schema = 'public';
-- (pg_restore reescreve parênteses de CHECK encadeado; a comparação ignora parênteses e espaços, não nomes nem condições)
select 'restricoes:' || md5(string_agg(conrelid::regclass::text || conname || regexp_replace(pg_get_constraintdef(oid), '[() ]', '', 'g'), '|' order by conrelid::regclass::text, conname)) from pg_constraint where connamespace = 'public'::regnamespace;
select 'funcoes:' || md5(string_agg(p.oid::regprocedure::text || pg_get_functiondef(p.oid), E'\n' order by p.oid::regprocedure::text)) from pg_proc p where p.pronamespace = 'public'::regnamespace;
select 'politicas:' || coalesce(md5(string_agg(schemaname || '.' || tablename || '.' || policyname || cmd || coalesce(qual, '') || coalesce(with_check, ''), '|' order by schemaname, tablename, policyname)), '-') from pg_policies;
select 'grants_tabela:' || coalesce(md5(string_agg(grantee || table_schema || table_name || privilege_type, '|' order by grantee, table_schema, table_name, privilege_type)), '-') from information_schema.role_table_grants where table_schema in ('public', 'storage');
select 'grants_funcao:' || coalesce(md5(string_agg(p.oid::regprocedure::text || coalesce(p.proacl::text, 'default'), '|' order by p.oid::regprocedure::text)), '-') from pg_proc p where p.pronamespace = 'public'::regnamespace;
select 'gatilhos:' || coalesce(md5(string_agg(pg_get_triggerdef(t.oid), '|' order by pg_get_triggerdef(t.oid))), '-') from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal and n.nspname in ('public', 'auth', 'storage');
select 'buckets:' || coalesce(md5(string_agg(id || public::text, '|' order by id)), '-') from storage.buckets;
select 'rls:' || coalesce(md5(string_agg(n.nspname || c.relname || c.relrowsecurity::text, '|' order by n.nspname, c.relname)), '-') from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'r' and n.nspname in ('public', 'storage');
SQL
}
counts() { "$@" -c "select (select count(*) from public.bookings)||'/'||(select count(*) from public.booking_meetings)||'/'||(select count(*) from public.audit_logs)||'/'||(select count(*) from public.profiles)||'/'||(select count(*) from public.meeting_skill_progress)||'/'||(select count(*) from public.app_notifications)"; }

# ---- gera (ou confere) o down.sql a partir de S0 ----
gen_down() {
  local hdr bal
  hdr="$(cat <<'HDR'
-- ROLLBACK da migration 20261121120000_meeting_interruption_resume.sql (PR #323, #93) E da 20261123130000_balance_minutes_count_resumed.sql (que depende dela). GERADO por scripts/test-backup-rollback.sh a partir do estado
-- anterior; o teste prova que este arquivo devolve o banco ao fingerprint de antes (colunas, restrições, funções, ACLs, gatilhos, RLS, dados).
-- USE SÓ COM BACKUP VERIFICADO E EM JANELA CONTROLADA. Rode com `psql -1 -f` (uma transação). NÃO está no caminho de migrations.
-- RECUSA se houver encontro interrompido: apagar as colunas perderia o motivo, os minutos e o estado da continuidade (exporte antes).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.booking_meetings WHERE interruption_count > 0 OR interruption_state IS NOT NULL OR previous_done_minutes > 0) THEN
    RAISE EXCEPTION 'Rollback refused: interrupted meetings exist (data would be lost). Complete or export them first.';
  END IF;
END $$;
-- 1) primeiro a função que lê as colunas novas volta ao corpo anterior (20261123130000 -> migration 42); só depois as colunas podem sair.
__BALANCE__
DROP TRIGGER IF EXISTS guard_interrupted_meeting_completion ON public.booking_meetings;
DROP FUNCTION IF EXISTS public.guard_interrupted_meeting_completion();
DROP FUNCTION IF EXISTS public.interrupt_meeting(uuid, text, integer, integer, integer[], integer[]);
DROP FUNCTION IF EXISTS public.schedule_meeting_resume(uuid, timestamptz);
DROP FUNCTION IF EXISTS public.complete_meeting_with_skills(uuid, integer, integer[], integer[]);
DROP FUNCTION IF EXISTS public.save_meeting_steps(uuid, integer[], integer[]);
DROP FUNCTION IF EXISTS public.assert_valid_meeting_steps(integer, integer[], integer[]);
ALTER TABLE public.booking_meetings DROP CONSTRAINT IF EXISTS booking_meetings_interruption_consistent;
ALTER TABLE public.booking_meetings
  DROP COLUMN IF EXISTS planned_minutes, DROP COLUMN IF EXISTS previous_done_minutes, DROP COLUMN IF EXISTS interruption_state,
  DROP COLUMN IF EXISTS interruption_reason, DROP COLUMN IF EXISTS interrupted_at, DROP COLUMN IF EXISTS remaining_minutes,
  DROP COLUMN IF EXISTS interruption_count, DROP COLUMN IF EXISTS resume_scheduled_at;
-- Corpos anteriores das duas funções que a migration substituiu (ACLs não mudam com CREATE OR REPLACE).
HDR
)"
  bal="$("${SA[@]}" -c "select pg_get_functiondef('public.booking_balance_minutes(uuid)'::regprocedure) || ';'")"
  printf '%s\n' "${hdr/__BALANCE__/$bal}"
  "${SA[@]}" -c "select pg_get_functiondef('public.start_ordered_meeting(uuid,text)'::regprocedure) || ';' ; select pg_get_functiondef('public.start_meeting(uuid,text)'::regprocedure) || ';'" \
    | sed -e 's/^\s*$//' 
  echo "NOTIFY pgrst, 'reload schema';"
}
"${SA[@]}" -c "select 1" >/dev/null
GEN="$A/down.generated.sql"; gen_down > "$GEN"
if [ "${WRITE_DOWN:-0}" = "1" ]; then cp "$GEN" "$DOWN"; echo "down.sql regerado em $DOWN"; fi
[ -f "$DOWN" ] || { echo "Falta $DOWN (rode com WRITE_DOWN=1)" >&2; exit 1; }
diff -q "$GEN" "$DOWN" >/dev/null || { echo "docs/rollback/20261121120000_down.sql está desatualizado em relação ao estado anterior:" >&2; diff "$GEN" "$DOWN" | head -20 >&2; exit 1; }

# ---- 1. estado anterior e backup ----
f0="$(fingerprint "${SA[@]}")"; c0="$(counts "${SA[@]}")"
BACKUP="$A/backup-pre-323.dump"
"$PG_BIN/pg_dump" -h "$A" -p "$PA" -U postgres -d postgres -Fc --no-owner -f "$BACKUP"
"$PG_BIN/pg_restore" -l "$BACKUP" >/dev/null || { echo "o backup não é legível pelo pg_restore" >&2; exit 1; }

# ---- 2. aplica a migration ----
"${QA[@]}" -1 -f "$ROOT/supabase/migrations/$TARGET" >/dev/null
for d in "${DEPENDENTS[@]}"; do "${QA[@]}" -1 -f "$ROOT/supabase/migrations/$d" >/dev/null; done
f1="$(fingerprint "${SA[@]}")"; c1="$(counts "${SA[@]}")"
[ "$f1" != "$f0" ] || { echo "a migration não mudou o fingerprint (o teste não enxerga a mudança)" >&2; exit 1; }
[ "$c1" = "$c0" ] || { echo "a migration alterou dados: $c0 -> $c1" >&2; exit 1; }

# ---- 3. restauração do backup anterior em cluster novo ----
"${QB[@]}" -c "create role anon nologin; create role authenticated nologin;"
"$PG_BIN/pg_restore" -h "$B" -p "$PB" -U postgres -d postgres --no-owner --exit-on-error "$BACKUP"
fb="$(fingerprint "${SB[@]}")"; cb="$(counts "${SB[@]}")"
if [ "$fb" != "$f0" ]; then echo "O banco restaurado difere do estado anterior à migration:" >&2; diff <(echo "$f0") <(echo "$fb") >&2 || true; exit 1; fi
[ "$cb" = "$c0" ] || { echo "contagens do restaurado diferem: $c0 -> $cb" >&2; exit 1; }
"${SB[@]}" -c "select 1 from information_schema.columns where table_name='booking_meetings' and column_name='interruption_state'" | grep -q 1 && { echo "o restaurado não deveria ter as colunas novas" >&2; exit 1; }

# ---- 4. recusa com dados de interrupção (nada é alterado) ----
sid="$("${SA[@]}" -c "select id from public.booking_meetings order by id limit 1")"
before_refuse="$(fingerprint "${SA[@]}")"
if "${QA[@]}" -1 -c "update public.booking_meetings set interruption_state='awaiting_resume', interruption_count=1, interruption_reason='motivo de teste', remaining_minutes=30, planned_minutes=60, previous_done_minutes=0 where id='$sid'" -f "$DOWN" >/dev/null 2>"$A/refuse.err"; then
  echo "o rollback deveria RECUSAR com encontro interrompido" >&2; exit 1
fi
grep -q "Rollback refused" "$A/refuse.err" || { echo "mensagem de recusa inesperada:" >&2; cat "$A/refuse.err" >&2; exit 1; }
[ "$(fingerprint "${SA[@]}")" = "$before_refuse" ] && [ "$(counts "${SA[@]}")" = "$c1" ] || { echo "a recusa deixou efeitos" >&2; exit 1; }

# ---- 5. rollback por SQL devolve o estado anterior ----
"${QA[@]}" -1 -f "$DOWN" >/dev/null
f2="$(fingerprint "${SA[@]}")"; c2="$(counts "${SA[@]}")"
if [ "$f2" != "$f0" ]; then echo "O rollback não devolveu o estado anterior:" >&2; diff <(echo "$f0") <(echo "$f2") >&2 || true; exit 1; fi
[ "$c2" = "$c0" ] || { echo "contagens após rollback diferem: $c0 -> $c2" >&2; exit 1; }
# A migration pode ser reaplicada depois do rollback (rollback limpo).
"${QA[@]}" -1 -f "$ROOT/supabase/migrations/$TARGET" >/dev/null
for d in "${DEPENDENTS[@]}"; do "${QA[@]}" -1 -f "$ROOT/supabase/migrations/$d" >/dev/null; done
[ "$(fingerprint "${SA[@]}")" = "$f1" ] || { echo "reaplicar após o rollback não reproduz o estado migrado" >&2; exit 1; }
echo "PASS: backup anterior à migration restaura o estado exato em cluster novo; rollback por SQL (down.sql) devolve fingerprint e dados e recusa quando há encontro interrompido; reaplicação é limpa"
echo "contagens (reservas/encontros/auditoria/perfis/habilidades/avisos): antes=$c0 migrado=$c1 restaurado=$cb apos_rollback=$c2"
