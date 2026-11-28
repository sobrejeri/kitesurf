-- #91 — SOMENTE LEITURA. Confere se as 5 funções que a migration 20261125100000_instructor_schedule_v2.sql SUBSTITUI (CREATE OR REPLACE) estão, no projeto,
-- iguais às do repositório, e se os objetos NOVOS ainda não existem. NÃO aplique a migration se algum "igual" vier false ou "DESCONHECIDA": cole a saída na issue #91.
-- Hash = md5 do corpo SEM comentários e SEM espaços (estável entre versões do PostgreSQL).
with esperado(assinatura, md5n) as (values
  ('instructor_can_attend(uuid,jsonb)',                                                      'e22126b26760495bf6b5077bc747a985'),
  ('can_move_meeting(uuid,uuid,timestamp with time zone,integer)',                           '932eee9119a0a9d3c146b3ac40fc737c'),
  ('save_my_schedule(integer[],time without time zone,time without time zone,integer)',      '3c781bddf823af63d30699a45b8eda6d'),
  ('block_my_time(timestamp with time zone,timestamp with time zone,text)',                  '1ea35d8e0f173ee731264fe2e9223ac8'),
  ('unblock_my_time(uuid)',                                                                  '4aecae7251e5f26b87e7f742f764713b'))
select e.assinatura, p.oid is not null as existe,
       md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) = e.md5n as igual,
       p.prosecdef as definer, p.proconfig::text as config, p.proacl::text as acl
from esperado e left join pg_proc p on p.pronamespace = 'public'::regnamespace and p.oid::regprocedure::text = e.assinatura
order by e.assinatura;
-- Objetos novos: ESPERADO 0 linhas (se existir, a migration já foi aplicada ou há colisão).
select proname from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('instructor_slot_open','reconcile_instructor_availability','list_my_schedule_conflicts','save_my_weekly_schedule','add_my_time_off','add_my_extra_hours','remove_my_extra_hours',
                  'assert_instructor_slot_free','guard_instructor_meeting_overlap','guard_instructor_booking_change');
select relname from pg_class where relnamespace = 'public'::regnamespace and relname in ('instructor_weekly_breaks','instructor_extra_hours');
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'instructor_time_off' and column_name = 'kind';
-- Dependências: ESPERADO 5 linhas (as tabelas da migration 07 existem).
select relname from pg_class where relnamespace = 'public'::regnamespace and relname in ('instructor_schedule_settings','instructor_weekly_hours','instructor_time_off','booking_meetings','bookings') and relkind = 'r';
-- Sobreposições HISTÓRICAS que a barreira nova ignora (ela só valida inserção/alteração). Contagem agregada, sem linhas.
select count(*) as pares_sobrepostos_historicos from public.booking_meetings a join public.bookings ba on ba.id = a.booking_id
  join public.booking_meetings b on b.id > a.id join public.bookings bb on bb.id = b.booking_id
 where ba.instructor_id = bb.instructor_id and ba.status = 'confirmed' and bb.status = 'confirmed' and a.status <> 'cancelled' and b.status <> 'cancelled'
   and tstzrange(a.starts_at, a.starts_at + make_interval(mins => a.minutes), '[)') && tstzrange(b.starts_at, b.starts_at + make_interval(mins => b.minutes), '[)');
