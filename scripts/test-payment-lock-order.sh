#!/usr/bin/env bash
# P2-1 da revisão independente da PR #300: DEADLOCK entre PAGAR uma reserva e CRIAR outra com o mesmo instrutor (mesmo aluno, duas abas).
#   confirm_test_payment travava o PERFIL do aluno (FOR UPDATE) e só depois a linha do INSTRUTOR (fila);
#   create_booking trava o INSTRUTOR (skip locked) e depois toma KEY SHARE no PERFIL ao inserir a reserva  -> espera circular.
# Reprodução fiel: um gatilho SÓ DE TESTE atrasa 2 s a transição para 'confirmed', exatamente na janela entre o lock do perfil e a
# atualização do instrutor. Nenhuma ordem de lock é alterada pelo teste. Só roda em banco descartável (scripts/test-db.sh).
# Esperado com a correção: a criação concorrente NÃO espera (o instrutor travado é pulado -> NO_INSTRUCTOR), o pagamento conclui, 0 deadlocks.
set -euo pipefail
: "${PG_TEST_SOCKET:?}"; : "${PG_TEST_PORT:?}"
PSQL=(psql -X -h "$PG_TEST_SOCKET" -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq)
scratch="$(mktemp -d)"; trap 'rm -rf "$scratch"; "${PSQL[@]}" -c "drop trigger if exists zz_test_delay on public.bookings; drop function if exists public.zz_test_delay()" >/dev/null 2>&1 || true' EXIT
A1=00000000-0000-0000-0000-0000000000a1; B2=00000000-0000-0000-0000-0000000000b2
JERI="$("${PSQL[@]}" -c "select id from public.beaches where slug='jeri'")"
dl0="$("${PSQL[@]}" -c "select deadlocks from pg_stat_database where datname='postgres'")"

# dois horarios livres (instrutor a1, aluno b2) em dias diferentes
IFS='|' read -r S1 S2 <<<"$("${PSQL[@]}" -F '|' -c "
  with c as (select (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => d, hours => 9)) at time zone 'America/Fortaleza' st from generate_series(3, 150) d
             where public.instructor_can_attend('$A1'::uuid, jsonb_build_array(jsonb_build_object('starts_at', (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => d, hours => 9)) at time zone 'America/Fortaleza', 'hours', 2)))
               and not exists (select 1 from public.booking_meetings m join public.bookings k on k.id=m.booking_id where k.student_id='$B2'::uuid and m.status::text<>'cancelled' and k.status::text in ('confirmed','awaiting_payment')
                   and tstzrange(m.starts_at, m.starts_at+make_interval(mins=>m.minutes),'[)') && tstzrange((date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => d, hours => 6)) at time zone 'America/Fortaleza', (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => d, hours => 14)) at time zone 'America/Fortaleza','[)')))
  select (select st from c order by st limit 1)::text, (select st from c order by st offset 1 limit 1)::text")"
[[ "$S1" =~ ^[0-9]{4}- ]] && [[ "$S2" =~ ^[0-9]{4}- ]] || { echo "Sem dois horarios livres para a1" >&2; exit 1; }
S1="${S1}"; S2="${S2}"
# reserva 1 (a pagar): criada como aluno, ainda pendente
B1ID="$("${PSQL[@]}" <<SQL
set role authenticated; select set_config('request.jwt.claim.sub', '$B2', false);
select public.create_booking('$JERI'::uuid, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', '$S1'::timestamptz, 'hours', 2)));
SQL
)"
B1ID="$(echo "$B1ID" | tail -1)"
[[ "$B1ID" =~ ^[0-9a-f-]{36}$ ]] || { echo "Falha ao criar a reserva a pagar: $B1ID" >&2; exit 1; }
[ "$("${PSQL[@]}" -c "select instructor_id from public.bookings where id='$B1ID'")" = "$A1" ] || { echo "a reserva a pagar deveria ser do instrutor a1" >&2; exit 1; }

# gatilho SO DE TESTE: atrasa 2 s a confirmacao (depois do lock do perfil, antes de atualizar a fila do instrutor)
"${PSQL[@]}" <<'SQL'
create function public.zz_test_delay() returns trigger language plpgsql as $$ begin perform pg_sleep(2); return new; end $$;
create trigger zz_test_delay after update of status on public.bookings for each row when (new.status = 'confirmed' and old.status <> 'confirmed') execute function public.zz_test_delay();
SQL

cat > "$scratch/pay.sql" <<SQL
set role authenticated; select set_config('request.jwt.claim.sub', '$B2', false);
select public.simulate_test_payment('$B1ID'::uuid, 'pix', 'approved');
SQL
cat > "$scratch/create.sql" <<SQL
set role authenticated; select set_config('request.jwt.claim.sub', '$B2', false);
select public.create_booking('$JERI'::uuid, 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', '$S2'::timestamptz, 'hours', 2)));
SQL
"${PSQL[@]}" -f "$scratch/pay.sql" > "$scratch/pay.out" 2> "$scratch/pay.err" & p1=$!
sleep 0.8                                     # o pagamento ja esta dentro da janela (perfil travado, atraso de 2 s correndo)
"${PSQL[@]}" -f "$scratch/create.sql" > "$scratch/create.out" 2> "$scratch/create.err" & p2=$!
s1=0; s2=0; wait "$p1" || s1=$?; wait "$p2" || s2=$?
dl1="$("${PSQL[@]}" -c "select deadlocks from pg_stat_database where datname='postgres'")"
if grep -qi "deadlock\|40P01" "$scratch/pay.err" "$scratch/create.err" || [ "$dl1" != "$dl0" ]; then
  echo "DEADLOCK entre pagar e criar reserva do mesmo aluno com o mesmo instrutor:" >&2; cat "$scratch/pay.err" "$scratch/create.err" >&2; exit 1
fi
[ "$s1" -eq 0 ] || { echo "o pagamento deveria concluir (status $s1):" >&2; cat "$scratch/pay.err" >&2; exit 1; }
[ "$("${PSQL[@]}" -c "select status::text from public.bookings where id='$B1ID'")" = "confirmed" ] || { echo "a reserva paga deveria estar confirmed" >&2; exit 1; }
# a criacao concorrente: ou conclui, ou e recusada porque o instrutor estava travado (nunca espera nem trava)
if [ "$s2" -ne 0 ]; then grep -q "NO_INSTRUCTOR\|No instructor available" "$scratch/create.err" || { echo "a criacao concorrente falhou por motivo inesperado:" >&2; cat "$scratch/create.err" >&2; exit 1; }; fi
# limpa: cancela o que o teste criou para nao esgotar a agenda de fixture
"${PSQL[@]}" -c "update public.bookings set status='cancelled', cancelled_at=now() where student_id='$B2'::uuid and id='$B1ID'" >/dev/null
"${PSQL[@]}" -c "update public.bookings set status='cancelled', cancelled_at=now() where student_id='$B2'::uuid and created_at > now() - interval '2 minutes' and status::text in ('awaiting_payment','confirmed')" >/dev/null
echo "PASS: pagar e criar reserva do mesmo aluno com o mesmo instrutor, ao mesmo tempo, sem deadlock (pagamento conclui; criacao concorrente conclui ou e recusada sem esperar)"
