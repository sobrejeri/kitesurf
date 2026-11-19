-- PACOTE DE CONSULTAS SOMENTE LEITURA para conciliar o Supabase (#88). Cole como está no conector/SQL Editor e devolva a saída de CADA bloco.
-- Nenhuma instrução aqui altera nada (só SELECT). Cada bloco diz o que se espera e o que fazer com o resultado.
-- Já respondidos em 19/11 (PR #300, comentário do retorno): Q1 (ledger = só 39 a 42) e Q2 (assinaturas e permissões de create_booking).
-- FALTAM: Q3 (decisiva), Q4 a Q9.

-- Q1 [JÁ FEITO] Histórico oficial. ATENÇÃO: só tem 39 a 42; as migrations 01 a 38 foram aplicadas à mão e NÃO aparecem aqui.
--      Por isso "não consta no histórico" não prova que uma migration anterior a 39 esteja ausente: use as sondas do Q10.
select version, name from supabase_migrations.schema_migrations order by version;

-- Q3 [DECISIVA] A correção #283 (trava do instrutor) está no corpo de create_booking? Isto responde se a 20261115100000 já foi aplicada.
--      ESPERADO: 2 linhas. ATENÇÃO: a trava (`for update … skip locked`) existe desde a migration 07; o que identifica a #283 é a REVALIDAÇÃO.
--      RESULTADO REAL (19/11): 6 args com trava = true e revalidação = FALSE (produção = versão da migration 10); 5 args sem trava e sem delegar.
--      A cadeia começa em 20261116160000 (delegado) e a 20261116170000 recria a função de 6 args inteira (tabela em HOMOLOGACAO_MIGRACOES_88.md).
select p.oid::regprocedure::text as assinatura,
       position('for update of i skip locked' in lower(pg_get_functiondef(p.oid))) > 0 as tem_trava_283,
       position('instructor_can_attend(chosen_instructor' in lower(pg_get_functiondef(p.oid))) > 0 as tem_revalidacao_283,
       position('p_partner_code, false' in lower(pg_get_functiondef(p.oid))) > 0 as delega_a_de_6_args
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'create_booking' order by 1;

-- Q4 A guarda do aluno (#298) já existe? ESPERADO antes de aplicar: 0 linhas e false.
select tgname from pg_trigger where tgname in ('guard_student_meeting_overlap_insert_update', 'guard_student_booking_activation_status') and not tgisinternal;
select to_regprocedure('public.guard_student_meeting_overlap()') is not null as guarda_existe;

-- Q5 Dados que a guarda do aluno passaria a recusar: alunos com dois encontros ATIVOS sobrepostos. ESPERADO: 0 linhas.
--    Se houver linhas, NÃO aplicar 20261117190000 antes de resolver (não apague nada; leve os pares a quem decide).
select b1.student_id, m1.id as encontro_a, m2.id as encontro_b, m1.starts_at as a_inicio, m2.starts_at as b_inicio
from public.booking_meetings m1
join public.bookings b1 on b1.id = m1.booking_id
join public.booking_meetings m2 on m2.id > m1.id
join public.bookings b2 on b2.id = m2.booking_id and b2.student_id = b1.student_id
where m1.status::text <> 'cancelled' and m2.status::text <> 'cancelled'
  and b1.status::text in ('confirmed', 'awaiting_payment') and b2.status::text in ('confirmed', 'awaiting_payment')
  and tstzrange(m1.starts_at, m1.starts_at + make_interval(mins => m1.minutes), '[)') && tstzrange(m2.starts_at, m2.starts_at + make_interval(mins => m2.minutes), '[)');

-- Q6 Duplo agendamento de INSTRUTOR já existente (sintoma do defeito de corrida). ESPERADO: 0 linhas.
--    (mesma consulta de docs/CONSULTA_duplo_agendamento_instrutor.sql)
select ba.instructor_id, a.booking_id as reserva_a, a.id as encontro_a, a.starts_at as inicio_a, b.booking_id as reserva_b, b.id as encontro_b, b.starts_at as inicio_b
from public.booking_meetings a
join public.bookings ba on ba.id = a.booking_id
join public.booking_meetings b on b.id > a.id and b.booking_id <> a.booking_id
join public.bookings bb on bb.id = b.booking_id and bb.instructor_id = ba.instructor_id
where a.status <> 'cancelled' and b.status <> 'cancelled'
  and ba.status in ('confirmed', 'awaiting_payment') and bb.status in ('confirmed', 'awaiting_payment')
  and tstzrange(a.starts_at, a.starts_at + make_interval(mins => a.minutes), '[)') && tstzrange(b.starts_at, b.starts_at + make_interval(mins => b.minutes), '[)')
order by a.starts_at;

-- Q7 O que já está vencido e ninguém avançou (a #92 registrou 4 buscas e 3 ofertas). Informa o impacto de ativar o agendador.
select 'busca_vencida' as tipo, count(*) as total from public.instructor_requests where status = 'searching' and expires_at <= now()
union all select 'oferta_vencida', count(*) from public.instructor_offers where status in ('offered', 'suggested') and expires_at <= now()
union all select 'remarcacao_pendente_vencida', count(*) from public.meeting_change_requests where status = 'pending' and expires_at <= now()
union all select 'saldo_pendente_vencido', count(*) from public.balance_meeting_requests where status = 'pending' and expires_at <= now();

-- Q8 pg_cron: disponível e/ou instalado? Há jobs? (o agendamento das migrations antigas só ocorre se o pg_cron já existia na hora.)
select name, default_version, installed_version from pg_available_extensions where name = 'pg_cron';
select jobname, schedule, active from cron.job order by jobname;   -- se der "schema cron does not exist", o pg_cron não está instalado (resultado esperado hoje)

-- Q9 Storage: buckets e políticas. ESPERADO: buckets de documentos, avatares e anexos de chat com public = false.
select id, public from storage.buckets order by id;
select policyname, cmd, roles from pg_policies where schemaname = 'storage' order by policyname;

-- Q10 Sondas que provam, SEM o histórico, quais migrations de 01 a 38 estão de fato aplicadas. ESPERADO: as 14 linhas, todas presentes = true.
select f.fn as funcao, exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f.fn) as presente, f.origem
from (values
  ('advance_instructor_offer', 'migration 11'), ('accept_instructor_offer', 'migration 11'), ('report_lesson_incident', 'migration 15'),
  ('request_meeting_change', 'migration 30/31'), ('release_my_booking', 'migration 31'), ('resolve_student_change', 'migration 31'),
  ('record_meeting_with_skills', 'migration 26'), ('start_ordered_meeting', 'migration 26'), ('publish_level_price_version', 'migration 36'),
  ('booking_balance_minutes', 'migration 38/42'), ('request_balance_meeting', 'migration 38'), ('simulate_test_payment', 'migration 09'),
  ('instructor_can_attend', 'migration 07'), ('confirm_validation_lesson', 'migration 34')) f(fn, origem) order by f.origem;

-- Q11 Prontidão para o E2E: quem existe por papel e quantos instrutores aprovados por praia (precisa de 3 elegíveis na mesma praia para A→B→C).
select role, count(*) as contas from public.profiles group by role order by role;
select b.slug as praia, i.status, count(*) as instrutores
from public.instructor_beaches ib join public.beaches b on b.id = ib.beach_id join public.instructors i on i.id = ib.instructor_id
group by b.slug, i.status order by b.slug, i.status;
