#!/usr/bin/env bash
# #88 (migrações): caminho de ATUALIZAÇÃO reproduzível em PostgreSQL descartável, sem tocar em nenhum Supabase.
#
#  1. Cria um banco como o de um ambiente que JÁ recebeu as migrations até 20261115100000 (a original da #283), já tem dados e ainda tem a
#     assinatura LEGADA de 5 args (SECURITY DEFINER, sem trava) e a de 6 args com a trava mas SEM a revalidacao, como o projeto real.
#  2. Aplica as migrations seguintes (a partir de 20261116160000) por cima, como o responsável faria no painel.
#  3. Confere: nenhum dado mudou; create_booking de 6 args sem defaults e de 5 args delegando; chamadas de 4, 5 e 6 args
#     resolvem sem ambiguidade; permissões por papel nas RPCs de reserva, fila, remarcação e presença.
#  4. Backup e restauração: pg_dump do banco atualizado, pg_restore em outro cluster descartável e comparação de
#     contagens, funções, políticas RLS, permissões de tabela e de função, gatilhos e buckets de Storage.
# O comparativo com o histórico de um Supabase real NÃO é feito aqui (ver docs/HOMOLOGACAO_MIGRACOES_88.md).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
[ "$(id -u)" != "0" ] || { echo "Rode como usuário não-root (o PostgreSQL recusa root)." >&2; exit 1; }
CUT="20261116160000"   # primeira migration "nova" desta rodada
A="$(mktemp -d)"; B="$(mktemp -d)"; PA="${PORT_A:-54661}"; PB="${PORT_B:-54662}"
trap '"$PG_BIN/pg_ctl" -D "$A" -m immediate stop >/dev/null 2>&1 || true; "$PG_BIN/pg_ctl" -D "$B" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$A" "$B"' EXIT

start() { "$PG_BIN/initdb" -D "$1" -U postgres --auth=trust >/dev/null; "$PG_BIN/pg_ctl" -D "$1" -o "-p $2 -k $1 -c listen_addresses=''" -w start >/dev/null; }
start "$A" "$PA"; start "$B" "$PB"
QA=(psql -h "$A" -p "$PA" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
QB=(psql -h "$B" -p "$PB" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
SA=("${QA[@]}" -At); SB=("${QB[@]}" -At)

# ---- 1. ambiente "antigo": migrations até a original, com dados ----
"${QA[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for m in "$ROOT"/supabase/migrations/*.sql; do
  v="$(basename "$m" | cut -d_ -f1)"
  [[ "$v" < "$CUT" ]] || continue
  "${QA[@]}" -1 -f "$m" >/dev/null
done
# Estado ANTES: a original ainda deixa defaults na assinatura de 6 args.
before_defaults="$("${SA[@]}" -c "select pronargdefaults from pg_proc where oid = 'public.create_booking(uuid,public.lesson_level,text,jsonb,text,boolean)'::regprocedure")"
[ "$before_defaults" = "2" ] || { echo "Esperava 2 defaults na assinatura de 6 args antes da atualização, tem $before_defaults" >&2; exit 1; }
"${QA[@]}" -f "$ROOT/supabase/tests/10_rules.test.sql" >/dev/null     # dados de reserva do fixture
data_snapshot() { "$@" -c "select (select count(*) from public.bookings)||'/'||(select count(*) from public.booking_meetings)||'/'||(select count(*) from public.audit_logs)||'/'||(select count(*) from public.profiles)||'/'||coalesce((select md5(string_agg(id::text||status::text||total_cents::text||coalesce(instructor_id::text,''), ',' order by id)) from public.bookings),'-')||'/'||coalesce((select md5(string_agg(id::text||starts_at::text||minutes::text||status::text, ',' order by id)) from public.booking_meetings),'-')"; }
before="$(data_snapshot "${SA[@]}")"
# Como o projeto REAL: a assinatura LEGADA de 5 args ainda existe (a migration 04 a apagaria, mas o projeto nao a recebeu), SECURITY DEFINER,
# sem a trava do instrutor, executavel por authenticated e nao por anon. A migration 20261116160000 (delegado) precisa substitui-la (CREATE OR REPLACE
# exige os mesmos nomes de parametros), nao apenas criar uma nova.
"${QA[@]}" <<'SQL'
create function public.create_booking(p_beach_id uuid, p_level public.lesson_level, p_language text, p_meetings jsonb, p_partner_code text default null)
returns uuid language plpgsql security definer set search_path = '' as $$ begin raise exception 'legacy path without instructor lock'; end $$;
revoke all on function public.create_booking(uuid, public.lesson_level, text, jsonb, text) from public, anon;
grant execute on function public.create_booking(uuid, public.lesson_level, text, jsonb, text) to authenticated;
SQL
# Estado INTERMEDIARIO do projeto real (retorno do responsavel, 19/11): a funcao de 6 args tem a TRAVA do instrutor mas NAO tem a revalidacao depois da
# trava. A migration 20261116170000 (sem defaults) recria a funcao INTEIRA, entao precisa entregar o corpo completo mesmo partindo desse estado.
"${QA[@]}" <<'SQL'
do $$ declare d text;
begin
  d := pg_get_functiondef('public.create_booking(uuid,public.lesson_level,text,jsonb,text,boolean)'::regprocedure);
  d := regexp_replace(d, 'if not public\.instructor_can_attend\(chosen_instructor, p_meetings\) then\s+raise exception[^;]*;\s+end if;', '', 'i');
  assert position('instructor_can_attend(chosen_instructor' in lower(d)) = 0, 'a mutacao deveria remover a revalidacao';
  assert position('for update of i skip locked' in lower(d)) > 0, 'a mutacao deve manter a trava';
  execute d;
end $$;
SQL
inter_state="$("${SA[@]}" -c "select (position('for update of i skip locked' in lower(pg_get_functiondef(p.oid))) > 0)::text || '/' || (position('instructor_can_attend(chosen_instructor' in lower(pg_get_functiondef(p.oid))) > 0)::text from pg_proc p where p.oid = 'public.create_booking(uuid,public.lesson_level,text,jsonb,text,boolean)'::regprocedure")"
[ "$inter_state" = "true/false" ] || { echo "fixture do estado intermediario invalido (trava/revalidacao): $inter_state" >&2; exit 1; }
assert_legacy="$("${SA[@]}" -c "select prosecdef::text || '/' || pronargdefaults from pg_proc where oid = 'public.create_booking(uuid,public.lesson_level,text,jsonb,text)'::regprocedure")"
[ "$assert_legacy" = "true/1" ] || { echo "fixture da assinatura legada invalido: $assert_legacy" >&2; exit 1; }

nb="$("${SA[@]}" -c "select count(*) from public.bookings")"
[ "$nb" -gt 0 ] || { echo "Fixture sem reservas: o teste de preservação de dados seria vazio" >&2; exit 1; }

# Sonda de EXPOSICAO: uma chamada de 5 args POR NOME (como a API faria) nunca pode cair no corpo LEGADO antigo (que no projeto real nao checa agenda nem tem trava).
# O fixture da legada levanta a mensagem "legacy path without instructor lock"; ver-la significa que o caminho antigo ficou alcancavel.
legacy_probe() { # $1 = rotulo do ponto
  out="$("${QA[@]}" -At 2>&1 <<'SQL'
set role authenticated;
select set_config('request.jwt.claim.sub', (select student_id::text from public.bookings limit 1), false);
do $$ declare m text; begin
  begin perform public.create_booking(p_beach_id => '00000000-0000-0000-0000-000000000000'::uuid, p_level => 'first_time'::public.lesson_level, p_language => 'x', p_meetings => '[]'::jsonb, p_partner_code => null::text);
  exception when others then m := sqlerrm; end;
  if m like '%legacy path without instructor lock%' then raise exception 'EXPOSTO'; end if;
end $$;
SQL
)" || { echo "EXPOSTO ($1): uma chamada de 5 args por nome caiu na funcao legada antiga" >&2; echo "$out" >&2; exit 1; }
}
legacy_probe "estado inicial (antes de qualquer migration da cadeia)"
# ---- 2. atualização por cima ----
applied=0
for m in "$ROOT"/supabase/migrations/*.sql; do
  v="$(basename "$m" | cut -d_ -f1)"
  [[ "$v" < "$CUT" ]] && continue
  "${QA[@]}" -1 -f "$m" >/dev/null || { echo "FALHA ao aplicar $(basename "$m") por cima do ambiente antigo" >&2; exit 1; }
  applied=$((applied + 1))
  legacy_probe "depois de $(basename "$m")"
done
[ "$applied" -ge 4 ] || { echo "Esperava aplicar pelo menos 4 migrations novas, aplicou $applied" >&2; exit 1; }
after="$(data_snapshot "${SA[@]}")"
[ "$before" = "$after" ] || { echo "A atualização alterou dados existentes:" >&2; echo "antes : $before" >&2; echo "depois: $after" >&2; exit 1; }

# ---- 3. assinaturas, resolução e permissões ----
"${QA[@]}" <<'SQL'
do $$
declare six oid := to_regprocedure('public.create_booking(uuid,public.lesson_level,text,jsonb,text,boolean)');
        five oid := to_regprocedure('public.create_booking(uuid,public.lesson_level,text,jsonb,text)');
        fn text; st text;
begin
  assert six is not null and five is not null, 'as duas assinaturas de create_booking devem existir';
  assert (select pronargdefaults from pg_proc where oid = six) = 0, 'a de 6 args nao pode ter defaults';
  assert (select pronargdefaults from pg_proc where oid = five) = 1, 'a de 5 args mantem so o codigo de afiliado opcional';
  assert (select prosecdef from pg_proc where oid = six), 'a de 6 args e SECURITY DEFINER';
  assert not (select prosecdef from pg_proc where oid = five), 'a de 5 args delega como invoker';
  assert position('p_partner_code, false' in lower(pg_get_functiondef(five))) > 0, 'a de 5 args delega a de 6';
  assert position('for update of i skip locked' in lower(pg_get_functiondef(six))) > 0, 'a de 6 args mantem o lock do instrutor';
  assert position('instructor_can_attend(chosen_instructor' in lower(pg_get_functiondef(six))) > 0, 'a de 6 args passa a ter a REVALIDACAO apos o lock (mesmo partindo do estado intermediario)';

  -- Resolucao sem ambiguidade: chamadas com 4, 5 e 6 argumentos chegam na validacao da funcao (22023 praia invalida), nunca em 42725/42883.
  perform set_config('request.jwt.claim.sub', (select student_id::text from public.bookings limit 1), true);
  execute 'set local role authenticated';
  foreach fn in array array[
    $q$select public.create_booking(p_beach_id => '00000000-0000-0000-0000-000000000000'::uuid, p_level => 'first_time'::public.lesson_level, p_language => 'x', p_meetings => '[]'::jsonb)$q$,
    $q$select public.create_booking(p_beach_id => '00000000-0000-0000-0000-000000000000'::uuid, p_level => 'first_time'::public.lesson_level, p_language => 'x', p_meetings => '[]'::jsonb, p_partner_code => null::text)$q$,
    $q$select public.create_booking(p_beach_id => '00000000-0000-0000-0000-000000000000'::uuid, p_level => 'first_time'::public.lesson_level, p_language => 'x', p_meetings => '[]'::jsonb, p_partner_code => null::text, p_with_transport => false)$q$]
  loop
    st := 'ok';
    begin execute fn; exception when others then st := sqlstate; end;
    assert st = '22023', format('chamada deveria resolver e falhar na validacao (22023), obteve %s: %s', st, fn);
  end loop;
  execute 'reset role';
end $$;

-- Permissoes por papel nas RPCs do fluxo de reserva/aula: anonimo nunca executa; autenticado executa as publicas;
-- funcoes internas (guardas) nao sao chamaveis por ninguem da API.
do $$
declare r record; n int := 0;
begin
  for r in select p.oid, p.oid::regprocedure::text as sig, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace
            and p.proname in ('create_booking','create_instructor_request','accept_instructor_offer','decline_instructor_offer','request_meeting_change',
                              'respond_meeting_change','resolve_student_change','start_ordered_meeting','record_meeting','record_meeting_with_skills',
                              'simulate_test_payment','booking_balance_minutes')
  loop
    n := n + 1;
    assert not has_function_privilege('anon', r.oid, 'EXECUTE'), 'anon NAO pode executar ' || r.sig;
    assert has_function_privilege('authenticated', r.oid, 'EXECUTE'), 'authenticated deve executar ' || r.sig;
  end loop;
  assert n >= 13, 'esperava ao menos 13 assinaturas de RPC de reserva/aula, achou ' || n;
  for r in select p.oid, p.oid::regprocedure::text as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
            and p.proname in ('guard_student_meeting_overlap','guard_student_booking_activation','guard_student_meeting_overlap_for_activation','instructor_can_attend')
  loop
    assert not has_function_privilege('anon', r.oid, 'EXECUTE') and not has_function_privilege('authenticated', r.oid, 'EXECUTE'), 'interna exposta: ' || r.sig;
  end loop;
end $$;
SQL

# ---- 4. backup e restauração ----
DUMP="$A/backup.dump"
"$PG_BIN/pg_dump" -h "$A" -p "$PA" -U postgres -d postgres -Fc --no-owner -f "$DUMP"
"${QB[@]}" -c "create role anon nologin; create role authenticated nologin;"
"$PG_BIN/pg_restore" -h "$B" -p "$PB" -U postgres -d postgres --no-owner --exit-on-error "$DUMP"

fingerprint() { "$@" <<'SQL'
select 'tabelas:' || coalesce((select md5(string_agg(t || '=' || c, ',' order by t)) from (
  select table_schema || '.' || table_name as t,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text as c
  from information_schema.tables where table_type = 'BASE TABLE' and table_schema in ('public', 'auth', 'storage')) x), '-');
select 'funcoes:' || md5(string_agg(p.oid::regprocedure::text || pg_get_functiondef(p.oid), E'\n' order by p.oid::regprocedure::text)) from pg_proc p where p.pronamespace = 'public'::regnamespace;
select 'politicas:' || coalesce(md5(string_agg(schemaname || '.' || tablename || '.' || policyname || cmd || coalesce(qual, '') || coalesce(with_check, ''), '|' order by schemaname, tablename, policyname)), '-') from pg_policies;
select 'grants_tabela:' || coalesce(md5(string_agg(grantee || table_schema || table_name || privilege_type, '|' order by grantee, table_schema, table_name, privilege_type)), '-') from information_schema.role_table_grants where table_schema in ('public', 'storage', 'auth');
select 'grants_funcao:' || coalesce(md5(string_agg(p.oid::regprocedure::text || coalesce(p.proacl::text, 'default'), '|' order by p.oid::regprocedure::text)), '-') from pg_proc p where p.pronamespace = 'public'::regnamespace;
select 'gatilhos:' || coalesce(md5(string_agg(pg_get_triggerdef(t.oid), '|' order by pg_get_triggerdef(t.oid))), '-') from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal and n.nspname in ('public', 'storage');
select 'buckets:' || coalesce(md5(string_agg(id || public::text, '|' order by id)), '-') from storage.buckets;
select 'rls:' || coalesce(md5(string_agg(n.nspname || c.relname || c.relrowsecurity::text, '|' order by n.nspname, c.relname)), '-') from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'r' and n.nspname in ('public', 'storage');
SQL
}
fa="$(fingerprint "${SA[@]}")"; fb="$(fingerprint "${SB[@]}")"
if [ "$fa" != "$fb" ]; then
  echo "O banco restaurado difere do original:" >&2; diff <(echo "$fa") <(echo "$fb") >&2 || true
  rows="select p.oid::regprocedure::text || ' ' || coalesce(p.proacl::text, 'default') from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1"
  echo "--- ACLs de funcao que diferem (< original, > restaurado):" >&2
  diff <("${SA[@]}" -c "$rows") <("${SB[@]}" -c "$rows") | head -12 >&2 || true
  exit 1
fi
[ "$(data_snapshot "${SB[@]}")" = "$after" ] || { echo "Dados de reserva do banco restaurado diferem do original" >&2; exit 1; }
# O banco restaurado funciona: a RPC resolve e o gatilho de sobreposição do aluno existe.
"${SB[@]}" -c "select 1 from pg_trigger where tgname = 'guard_student_meeting_overlap_insert_update' and not tgisinternal" | grep -q 1 || { echo "gatilho do aluno ausente após restauração" >&2; exit 1; }

echo "PASS: atualização por cima de um ambiente com a original aplicada (${applied} migrations novas, ${nb} reservas preservadas), create_booking sem ambiguidade, permissões por papel e backup/restauração idênticos"
