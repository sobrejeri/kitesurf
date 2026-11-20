#!/usr/bin/env bash
# ENSAIO da cadeia de migrations da PR #300/#303 num banco ISOLADO (projeto Supabase novo ou cópia restaurada de um dump).
# Aplica as migrations NA ORDEM SEGURA, uma por vez, confere a verificação de cada passo e PARA no primeiro erro, mostrando a mensagem exata.
# Cada arquivo é uma transação: o que falhou foi desfeito, nada fica pela metade.
#
# SEGURANÇA (recusa de propósito, sem opção de contornar):
#   - recusa a URL do projeto de produção/atual (qadkqjfmmnxvovyyhqxw);
#   - exige CONFIRM_ISOLATED=sim, para ninguém rodar por engano;
#   - recusa se o D7 achar função DESCONHECIDA entre as que a cadeia substitui (ajuste manual: comparar o texto antes).
# NÃO usa `supabase db push`. NÃO escreve em nada além das migrations listadas.
#
# Uso:  DATABASE_URL='postgresql://...isolado...' CONFIRM_ISOLATED=sim bash scripts/rehearse-chain.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${DATABASE_URL:?Defina DATABASE_URL com a string de conexão do banco ISOLADO}"
[ "${CONFIRM_ISOLATED:-}" = "sim" ] || { echo "Recusado: defina CONFIRM_ISOLATED=sim para confirmar que o banco é ISOLADO." >&2; exit 2; }
case "$DATABASE_URL" in *qadkqjfmmnxvovyyhqxw*) echo "RECUSADO: esta URL é a do projeto atual/produção. Use um projeto isolado (docs/HOMOLOGACAO_PROJETO_ISOLADO.md)." >&2; exit 2;; esac
command -v psql >/dev/null || { echo "psql não encontrado" >&2; exit 2; }
Q=(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -q); A=("${Q[@]}" -At)

echo "== Banco: $("${A[@]}" -c "select current_database() || ' em ' || coalesce(inet_server_addr()::text, 'socket local')")"

# ---- 0. pré-checagens (somente leitura) ----
echo "== Pré-checagens"
# A falha de SQL/arquivo no D7 NÃO pode virar "0 DESCONHECIDA" por causa do grep.
D7="$ROOT/docs/CONSULTA_DERIVA_ANTES_DE_APLICAR.sql"
[ -f "$D7" ] || { echo "RECUSADO: consulta D7 ausente: $D7" >&2; exit 2; }
if ! d7_output="$("${A[@]}" -f "$D7" 2>&1)"; then
  echo "RECUSADO: pré-checagem D7 falhou; nenhuma migration será aplicada." >&2
  echo "$d7_output" >&2
  exit 2
fi
unknown="$(printf '%s\n' "$d7_output" | grep -c "DESCONHECIDA" || true)"
if [ "${unknown:-0}" != "0" ]; then
  echo "RECUSADO: o D7 encontrou $unknown função(ões) DESCONHECIDA(s) (ajuste manual). Rode o D6/D7 e compare o texto antes de aplicar." >&2
  "${Q[@]}" -f "$ROOT/docs/CONSULTA_DERIVA_ANTES_DE_APLICAR.sql" 2>&1 | grep "DESCONHECIDA" >&2 || true
  exit 3
fi
dups="$("${A[@]}" -c "select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='create_booking'")"
echo "   assinaturas de create_booking: $dups"

step() { # $1=arquivo  $2=SQL de verificação (deve devolver 't')  $3=descrição
  local f="$ROOT/supabase/migrations/$1"
  [ -f "$f" ] || { echo "FALHOU: migration obrigatória ausente: $1. Nenhuma etapa pode ser pulada." >&2; exit 2; }
  echo "== Aplicando $1"
  if ! out="$("${Q[@]}" -1 -f "$f" 2>&1)"; then
    echo "FALHOU em $1. Mensagem exata abaixo. NÃO continue: copie para a issue #88." >&2
    echo "$out" | grep -v "WARNING:  there is" >&2; exit 1
  fi
  v="$("${A[@]}" -c "$2" 2>&1)" || { echo "A verificação de $1 deu erro: $v" >&2; exit 1; }
  [ "$v" = "t" ] || { echo "A verificação de $1 NÃO passou (esperado t, obtido '$v'): $3" >&2; exit 1; }
  echo "   ok: $3"
}

SIX="'public.create_booking(uuid,public.lesson_level,text,jsonb,text,boolean)'::regprocedure"
FIVE="'public.create_booking(uuid,public.lesson_level,text,jsonb,text)'::regprocedure"
# ---- 1. cadeia, na ORDEM SEGURA (o delegado ANTES de remover os defaults) ----
step 20261116160000_create_booking_legacy_safe_delegate.sql \
  "select (not prosecdef) and pronargdefaults = 1 and not has_function_privilege('anon', oid, 'EXECUTE') from pg_proc where oid = $FIVE" \
  "legada de 5 args virou delegado SECURITY INVOKER (defaults da de 6 args ainda existem: normal neste passo)"
step 20261116170000_create_booking_six_args_no_defaults.sql \
  "select pronargdefaults = 0 and position('instructor_can_attend(chosen_instructor' in lower(pg_get_functiondef(oid))) > 0 and position('for update of i skip locked' in lower(pg_get_functiondef(oid))) > 0 and not has_function_privilege('anon', oid, 'EXECUTE') and has_function_privilege('authenticated', oid, 'EXECUTE') from pg_proc where oid = $SIX" \
  "6 args sem defaults, com trava E revalidação da #283, anon sem EXECUTE"
step 20261117190000_guard_student_meeting_overlap.sql \
  "select (select count(*) from pg_trigger where tgname in ('guard_student_meeting_overlap_insert_update','guard_student_booking_activation_status') and not tgisinternal) = 2 and not has_function_privilege('authenticated', 'public.guard_student_meeting_overlap()'::regprocedure, 'EXECUTE')" \
  "2 gatilhos da guarda do aluno ativos e a função fechada à API"
step 20261119120000_offer_accept_student_conflict.sql \
  "select position('offer.student_conflict' in pg_get_functiondef('public.accept_instructor_offer(uuid)'::regprocedure)) > 0 and has_function_privilege('authenticated', 'public.accept_instructor_offer(uuid)'::regprocedure, 'EXECUTE') and not has_function_privilege('anon', 'public.accept_instructor_offer(uuid)'::regprocedure, 'EXECUTE')" \
  "accept_instructor_offer trata o conflito do aluno e mantém as permissões"
step 20261119130000_meeting_change_student_conflict.sql \
  "select position('student-meetings' in pg_get_functiondef('public.request_meeting_change(uuid,timestamptz,text)'::regprocedure)) > 0 and position('student-meetings' in pg_get_functiondef('public.respond_meeting_change(uuid,boolean)'::regprocedure)) > 0" \
  "remarcação barra conflito com outro encontro do aluno (pedido e resposta)"
# Instrutor preferido (decisão separada): só roda com INCLUDE_PREFERRED=1, para ensaiar a cadeia com e sem elas.
# As duas têm corpo idêntico (a 2ª só troca o cabeçalho); só vale a 1ª, a 2ª é no-op. CREATE OR REPLACE mantém os GRANTs (função fechada à API).
if [ "${INCLUDE_PREFERRED:-0}" = "1" ]; then
  for f in 20261113000043_preferred_instructor_availability.sql 20261114002000_fix_preferred_instructor_availability.sql; do
    step "$f" \
      "select position('distinct from r.preferred_instructor_id' in pg_get_functiondef('public.advance_instructor_offer(uuid)'::regprocedure)) = 0 and not has_function_privilege('anon', 'public.advance_instructor_offer(uuid)'::regprocedure, 'EXECUTE') and not has_function_privilege('authenticated', 'public.advance_instructor_offer(uuid)'::regprocedure, 'EXECUTE')" \
      "instrutor preferido passa pela mesma checagem de agenda; função segue fechada à API"
  done
fi
step 20261119140000_queue_expiry_job.sql \
  "select not has_function_privilege('anon', 'public.run_expiry_jobs()'::regprocedure, 'EXECUTE') and not has_function_privilege('authenticated', 'public.run_expiry_jobs()'::regprocedure, 'EXECUTE') and not has_function_privilege('authenticated', 'public.run_queue_expiry_job(integer)'::regprocedure, 'EXECUTE')" \
  "jobs de expiração criados e fechados à API (nada foi agendado)"
step 20261120100000_confirm_payment_lock_order.sql \
  "select position('Booking changed, try again' in pg_get_functiondef('public.confirm_test_payment(uuid)'::regprocedure)) > 0 and has_function_privilege('authenticated', 'public.confirm_test_payment(uuid)'::regprocedure, 'EXECUTE')" \
  "confirmação de pagamento na ordem canônica de locks (só na #303)"

step 20261120110000_simulate_test_payment_canonical_lock_order.sql \
  "select position('Do NOT lock bookings' in pg_get_functiondef('public.simulate_test_payment(uuid,text,text)'::regprocedure)) > 0 and has_function_privilege('authenticated', 'public.simulate_test_payment(uuid,text,text)'::regprocedure, 'EXECUTE') and not has_function_privilege('anon', 'public.simulate_test_payment(uuid,text,text)'::regprocedure, 'EXECUTE')" \
  "pagamento simulado não trava a reserva antes da confirmação (ordem canônica de locks); permissões mantidas (só na #303)"
step 20261120120000_meeting_start_24h_window.sql \
  "select position('24 hours' in pg_get_functiondef('public.start_ordered_meeting(uuid,text)'::regprocedure)) > 0 and has_function_privilege('authenticated', 'public.start_ordered_meeting(uuid,text)'::regprocedure, 'EXECUTE') and not has_function_privilege('anon', 'public.start_ordered_meeting(uuid,text)'::regprocedure, 'EXECUTE')" \
  "início do encontro liberado até 24h antes do horário (decisão do responsável); permissões mantidas (só na #303)"

# ---- 2. conferência final (cada checagem separada; qualquer falso para) ----
echo "== Conferência final"
chk() { r="$("${A[@]}" -c "$2" 2>&1)" || { echo "A conferência '$1' deu erro: $r" >&2; exit 1; }; [ "$r" = "t" ] || { echo "A conferência '$1' NÃO passou (obtido '$r')" >&2; exit 1; }; echo "   ok: $1"; }
chk "create_booking tem exatamente 2 assinaturas (6 args sem defaults e delegado de 5)" "select count(*) = 2 from pg_proc where pronamespace='public'::regnamespace and proname='create_booking'"
chk "anon não executa nenhuma RPC de reserva, fila, remarcação, presença ou saldo" "select count(*) = 0 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('create_booking','accept_instructor_offer','request_meeting_change','respond_meeting_change','resolve_student_change','start_ordered_meeting','record_meeting','record_meeting_with_skills','booking_balance_minutes') and has_function_privilege('anon', p.oid, 'EXECUTE')"
chk "nenhum job do Vento foi agendado no pg_cron" "select coalesce((select (xpath('/row/c/text()', query_to_xml('select count(*) as c from cron.job where jobname like ''vento-%''', false, true, '')))[1]::text::int from (select 1) x where to_regclass('cron.job') is not null), 0) = 0"
echo "PASS: a cadeia foi aplicada na ordem segura neste banco ISOLADO, com a verificação de cada passo. Nada foi agendado no pg_cron."
