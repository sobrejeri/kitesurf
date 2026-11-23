-- #92 (preparo 23/11/2026) — SOMENTE LEITURA. Dependências das migrations do instrutor preferido
-- (20261113000043_preferred_instructor_availability.sql e 20261114002000_fix_preferred_instructor_availability.sql; corpos IDÊNTICOS, md5 normalizado cbe19ad4c1fc4df54f8d2ebcfecc3628)
-- no Supabase Kitesurf. Nenhuma instrução altera nada. Devolva a saída de cada bloco. NÃO rode run_expiry_jobs/run_queue_expiry_job: elas não existem no banco real e não devem ser executadas contra pedidos existentes.

-- P1 Colunas de que a função depende. ESPERADO: 14 linhas (todas existem).
select c.table_name, c.column_name from information_schema.columns c
where c.table_schema = 'public' and (c.table_name, c.column_name) in (
  ('instructor_requests','id'), ('instructor_requests','status'), ('instructor_requests','expires_at'), ('instructor_requests','beach_id'), ('instructor_requests','language'),
  ('instructor_requests','meetings'), ('instructor_requests','with_transport'), ('instructor_requests','preferred_instructor_id'),
  ('instructors','id'), ('instructors','status'), ('instructors','languages'), ('instructors','has_support_vehicle'), ('instructors','queue_position'),
  ('instructor_beaches','instructor_id'), ('instructor_beaches','beach_id'),
  ('instructor_offers','request_id'), ('instructor_offers','instructor_id'), ('instructor_offers','status'), ('instructor_offers','expires_at'), ('instructor_offers','responded_at'))
order by 1, 2;

-- P2 Funções de que a função depende. ESPERADO: instructor_can_attend(uuid,jsonb) e write_audit(text,text,text,jsonb,jsonb,text) presentes.
select p.oid::regprocedure::text as funcao from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('instructor_can_attend', 'write_audit', 'advance_instructor_offer') order by 1;

-- P3 Versão atual de advance_instructor_offer. ESPERADO hoje: 07ba8bce57117edfd686b668306a9ea7 (migration 14, isenta o preferido da checagem de agenda).
--    cbe19ad4c1fc4df54f8d2ebcfecc3628 = versão das migrations do instrutor preferido (NÃO aplicada). Qualquer outro valor = deriva: pare e compare o texto.
select md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as hash_normalizado,
       pg_get_functiondef(p.oid) like '%distinct from r.preferred_instructor_id%' as isenta_preferido_da_agenda
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'advance_instructor_offer';

-- P4 Permissões (ESPERADO: fechada à API) e que o job de expiração NÃO existe no banco real.
select has_function_privilege('anon', 'public.advance_instructor_offer(uuid)', 'EXECUTE') as anon, has_function_privilege('authenticated', 'public.advance_instructor_offer(uuid)', 'EXECUTE') as auth;
select to_regprocedure('public.run_queue_expiry_job(integer)') is null as job_ainda_nao_existe, to_regprocedure('public.run_expiry_jobs()') is null as job_geral_ainda_nao_existe;

-- P5 Instrutores aprovados por praia (a #92 precisa de 3 elegíveis na mesma praia para o A→B→C real; hoje há 1). Contagem agregada, sem dados pessoais.
select b.slug as praia, i.status, count(*) as instrutores from public.instructor_beaches ib join public.beaches b on b.id = ib.beach_id join public.instructors i on i.id = ib.instructor_id group by 1, 2 order by 1, 2;

-- P6 Pedidos vencidos que o job TRATARIA (contagem agregada; não os toque). Compare com o teste scripts/test-expiry-overdue-requests.sh.
select 'busca_vencida' as tipo, count(*) as total from public.instructor_requests where status = 'searching' and expires_at <= now()
union all select 'oferta_viva_vencida', count(*) from public.instructor_offers where status in ('offered', 'suggested') and expires_at <= now()
union all select 'busca_com_oferta_vencida_e_janela_aberta', count(*) from public.instructor_requests q where q.status = 'searching' and q.expires_at > now() and exists (select 1 from public.instructor_offers o where o.request_id = q.id and o.status in ('offered','suggested') and o.expires_at <= now())
union all select 'remarcacao_pendente_vencida (run_expiry_jobs tambem agiria)', count(*) from public.meeting_change_requests where status = 'pending' and expires_at <= now()
union all select 'saldo_pendente_vencido (run_expiry_jobs tambem agiria)', count(*) from public.balance_meeting_requests where status = 'pending' and expires_at <= now();
