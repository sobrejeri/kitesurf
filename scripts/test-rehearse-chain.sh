#!/usr/bin/env bash
# Testa scripts/rehearse-chain.sh num banco descartável com o estado REAL do projeto (D1-D7 de 19/11/2026):
#   create_booking(6 args) na versão da migration 10 (sem a revalidação), legada de 5 args antiga, advance_instructor_offer na migration 14.
#  A) caminho feliz: PASS, e a cadeia fica aplicada
#  B) ajuste manual em accept_instructor_offer: o script RECUSA antes de aplicar qualquer coisa (D7 = DESCONHECIDA)
#  C) um objeto depende da função de 6 args: a 20261116170000 falha, o script PARA com a mensagem exata e as migrations seguintes NÃO são aplicadas
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
[ "$(id -u)" != "0" ] || { echo "Rode como usuário não-root." >&2; exit 1; }
D="$(mktemp -d)"; P="${PORT_D:-54664}"
trap '"$PG_BIN/pg_ctl" -D "$D" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
"$PG_BIN/initdb" -D "$D" -U postgres --auth=trust >/dev/null; "$PG_BIN/pg_ctl" -D "$D" -o "-p $P -k $D -c listen_addresses=''" -w start >/dev/null
SQL() { psql -h "$D" -p "$P" -U postgres -v ON_ERROR_STOP=1 -q -At "$@"; }
mkprod() { # $1 = banco novo, com o estado real do projeto
  SQL -d postgres -c "create database $1" >/dev/null
  local Q=(psql -h "$D" -p "$P" -U postgres -d "$1" -v ON_ERROR_STOP=1 -q)
  "${Q[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql"
  for m in "$ROOT"/supabase/migrations/*.sql; do
    v="$(basename "$m" | cut -d_ -f1)"; [[ "$v" < "20261116160000" ]] || continue
    case "$m" in *20261113000043*|*20261114002000*) continue;; esac
    "${Q[@]}" -1 -f "$m" >/dev/null 2>&1 || { echo "FALHA ao montar o estado de producao: $m" >&2; exit 1; }
  done
  "${Q[@]}" <<'SQL2'
do $$ declare d text; begin
  d := pg_get_functiondef('public.create_booking(uuid,public.lesson_level,text,jsonb,text,boolean)'::regprocedure);
  d := regexp_replace(d, 'if not public\.instructor_can_attend\(chosen_instructor, p_meetings\) then\s+raise exception[^;]*;\s+end if;', '', 'i');
  execute d; end $$;
create function public.create_booking(p_beach_id uuid, p_level public.lesson_level, p_language text, p_meetings jsonb, p_partner_code text default null)
returns uuid language plpgsql security definer set search_path = '' as $$ begin raise exception 'legacy path without instructor lock'; end $$;
revoke all on function public.create_booking(uuid, public.lesson_level, text, jsonb, text) from public, anon;
grant execute on function public.create_booking(uuid, public.lesson_level, text, jsonb, text) to authenticated;
SQL2
}
url() { echo "postgresql:///$1?host=$D&port=$P&user=postgres"; }
run() { DATABASE_URL="$(url "$1")" CONFIRM_ISOLATED=sim bash "$ROOT/scripts/rehearse-chain.sh"; }

# A) caminho feliz
mkprod rehearse_ok
out="$(run rehearse_ok 2>&1)" || { echo "A) o ensaio deveria passar no estado real do projeto:" >&2; echo "$out" >&2; exit 1; }
echo "$out" | grep -q "^PASS:" || { echo "A) sem a linha PASS" >&2; exit 1; }
[ "$(SQL -d rehearse_ok -c "select count(*) from pg_trigger where tgname='guard_student_meeting_overlap_insert_update' and not tgisinternal")" = "1" ] || { echo "A) a guarda do aluno deveria estar aplicada" >&2; exit 1; }

# B) ajuste manual numa funcao que a cadeia substitui => recusa antes de aplicar qualquer coisa
mkprod rehearse_drift
SQL -d rehearse_drift -c "create or replace function public.accept_instructor_offer(p_offer_id uuid) returns uuid language plpgsql security definer set search_path='' as \$\$ begin raise exception 'ajuste manual'; end \$\$;"
set +e; out="$(run rehearse_drift 2>&1)"; rc=$?; set -e
[ "$rc" -eq 3 ] || { echo "B) esperado codigo 3 (recusa por DESCONHECIDA), obteve $rc" >&2; echo "$out" >&2; exit 1; }
echo "$out" | grep -q "DESCONHECIDA" || { echo "B) a recusa deveria citar DESCONHECIDA" >&2; exit 1; }
[ "$(SQL -d rehearse_drift -c "select count(*) from pg_proc where proname='guard_student_meeting_overlap'")" = "0" ] || { echo "B) nada deveria ter sido aplicado" >&2; exit 1; }

# C) dependente da funcao de 6 args => a 20261116170000 falha (DROP RESTRICT); o script para e as seguintes nao sao aplicadas
mkprod rehearse_dep
SQL -d rehearse_dep -c "create table public.zz_dep (x uuid default public.create_booking('00000000-0000-0000-0000-000000000000'::uuid, 'first_time'::public.lesson_level, 'x', '[]'::jsonb, null, false))"
set +e; out="$(run rehearse_dep 2>&1)"; rc=$?; set -e
[ "$rc" -eq 1 ] || { echo "C) esperado codigo 1 (falha no passo), obteve $rc" >&2; echo "$out" >&2; exit 1; }
echo "$out" | grep -q "FALHOU em 20261116170000" || { echo "C) deveria falhar na 20261116170000" >&2; echo "$out" >&2; exit 1; }
echo "$out" | grep -qi "depend" || { echo "C) a mensagem exata do banco deveria aparecer (dependencia)" >&2; echo "$out" >&2; exit 1; }
[ "$(SQL -d rehearse_dep -c "select count(*) from pg_proc where proname='guard_student_meeting_overlap'")" = "0" ] || { echo "C) as migrations seguintes NAO deveriam ter sido aplicadas" >&2; exit 1; }
[ "$(SQL -d rehearse_dep -c "select (position('instructor_can_attend(chosen_instructor' in lower(pg_get_functiondef('public.create_booking(uuid,public.lesson_level,text,jsonb,text,boolean)'::regprocedure))) = 0)::text")" = "true" ] || { echo "C) a transacao que falhou deveria ter sido desfeita (create_booking intacta)" >&2; exit 1; }
# D) arquivo obrigatorio ausente: ensaio deve recusar, jamais pular etapa e dizer PASS
mkprod rehearse_missing
mkdir -p "$D/rehearse_copy/scripts" "$D/rehearse_copy/docs" "$D/rehearse_copy/supabase/migrations"
cp "$ROOT/scripts/rehearse-chain.sh" "$D/rehearse_copy/scripts/"
cp "$ROOT/docs/CONSULTA_DERIVA_ANTES_DE_APLICAR.sql" "$D/rehearse_copy/docs/"
cp "$ROOT"/supabase/migrations/202611{16,17,19,20}*.sql "$D/rehearse_copy/supabase/migrations/"
rm "$D/rehearse_copy/supabase/migrations/20261119140000_queue_expiry_job.sql"
set +e
out="$(DATABASE_URL="$(url rehearse_missing)" CONFIRM_ISOLATED=sim bash "$D/rehearse_copy/scripts/rehearse-chain.sh" 2>&1)"
rc=$?
set -e
[ "$rc" -eq 2 ] || { echo "D) esperado codigo 2 para migration ausente, obteve $rc" >&2; echo "$out" >&2; exit 1; }
echo "$out" | grep -q "migration obrigatória ausente: 20261119140000" || { echo "D) falta mensagem explicita da migration" >&2; echo "$out" >&2; exit 1; }
! echo "$out" | grep -q "^PASS:" || { echo "D) ensaio incompleto nunca pode retornar PASS" >&2; exit 1; }
[ "$(SQL -d rehearse_missing -c "select count(*) from pg_proc where proname='run_expiry_jobs'")" = "0" ] || { echo "D) nao deveria criar o job ausente" >&2; exit 1; }
# E) instrutor preferido: sem INCLUDE_PREFERRED a cadeia NAO as aplica (A); com INCLUDE_PREFERRED=1 aplica, verifica e mantem a funcao fechada
# a migration 14 isenta o instrutor preferido da checagem de agenda (para ele poder sugerir outra data); a 43/2000 remove a isencao
HAS='select position($q$distinct from r.preferred_instructor_id$q$ in pg_get_functiondef($q$public.advance_instructor_offer(uuid)$q$::regprocedure)) = 0'
[ "$(SQL -d rehearse_ok -c "$HAS")" = "f" ] || { echo "E) sem INCLUDE_PREFERRED, advance_instructor_offer deveria seguir na versao da migration 14 (com a isencao do preferido)" >&2; exit 1; }
mkprod rehearse_pref
out="$(INCLUDE_PREFERRED=1 run rehearse_pref 2>&1)" || { echo "E) ensaio com instrutor preferido deveria passar:" >&2; echo "$out" >&2; exit 1; }
echo "$out" | grep -q "^PASS:" || { echo "E) sem a linha PASS" >&2; exit 1; }
[ "$(SQL -d rehearse_pref -c "$HAS")" = "t" ] || { echo "E) advance_instructor_offer deveria exigir agenda tambem do instrutor preferido" >&2; exit 1; }
[ "$(SQL -d rehearse_pref -c "select (has_function_privilege('authenticated','public.advance_instructor_offer(uuid)'::regprocedure,'EXECUTE') or has_function_privilege('anon','public.advance_instructor_offer(uuid)'::regprocedure,'EXECUTE'))::text")" = "false" ] || { echo "E) advance_instructor_offer deve seguir fechada a API" >&2; exit 1; }
echo "PASS: ensaio completo, recusa deriva, falha em dependencias, recusa migration ausente e variante com instrutor preferido"

# F) consulta D7 ausente: deve recusar ANTES de qualquer migration.
mkprod rehearse_no_d7
rm "$D/rehearse_copy/docs/CONSULTA_DERIVA_ANTES_DE_APLICAR.sql"
set +e
out="$(DATABASE_URL="$(url rehearse_no_d7)" CONFIRM_ISOLATED=sim bash "$D/rehearse_copy/scripts/rehearse-chain.sh" 2>&1)"
rc=$?
set -e
[ "$rc" -eq 2 ] || { echo "F) esperado codigo 2 sem D7, obteve $rc" >&2; echo "$out" >&2; exit 1; }
echo "$out" | grep -q "consulta D7 ausente" || { echo "F) faltou mensagem de recusa D7" >&2; echo "$out" >&2; exit 1; }
[ "$(SQL -d rehearse_no_d7 -c "select count(*) from pg_proc where proname='guard_student_meeting_overlap'")" = "0" ] || { echo "F) nenhuma migration deve ser aplicada sem D7" >&2; exit 1; }
echo "PASS: D7 ausente bloqueia ensaio antes de qualquer migration"
