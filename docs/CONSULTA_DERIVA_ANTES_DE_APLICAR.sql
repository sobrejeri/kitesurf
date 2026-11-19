-- SOMENTE LEITURA. Confere se as funções que as migrations da #300/#303 vão SUBSTITUIR (CREATE OR REPLACE) estão, no projeto, iguais às do repositório.
-- Motivo: este projeto recebeu as migrations 01 a 38 à mão e já divergiu do repositório uma vez (a assinatura legada de 5 args de create_booking
-- existe aqui e o repositório a apaga na migration 04). Substituir uma função que foi alterada à mão sobrescreve a alteração em silêncio.
-- Como ler: bloco D1 => `igual` deve ser true nas linhas "substitui". ATENÇÃO: create_booking (6 args) JÁ SE SABE intermediário (trava sem revalidação, 19/11), então
-- `igual = false` nela é esperado; para ela vale o D6 (texto). Para as demais, qualquer false: NÃO aplique; cole a saída na issue #88.
-- O hash é md5 do CORPO (prosrc), estável entre versões do PostgreSQL. Esperados gerados de um banco construído pelas migrations < 20261116160000.

-- D1 Corpo atual x esperado.
with esperado(assinatura, md5_esperado, papel) as (values
  ('create_booking(uuid,lesson_level,text,jsonb,text,boolean)',        '982c0e8cc65ad082ba9bb43f00db3a00', 'substitui (20261116160000)'),
  ('accept_instructor_offer(uuid)',                                    '42849e3b652615efe9a9613fee5ef1f7', 'substitui (20261119120000)'),
  ('request_meeting_change(uuid,timestamp with time zone,text)',       'f27abb79af5ade646fa950f1a49aefa7', 'substitui (20261119130000)'),
  ('respond_meeting_change(uuid,boolean)',                             '73b9b1d2827663586e9bc4007b95b9b6', 'substitui (20261119130000)'),
  ('confirm_test_payment(uuid)',                                       '98eafe9d56ebaace3211f97569bbcda4', 'substitui (20261120100000)'),
  ('advance_instructor_offer(uuid)',                                   'e6dbe921aaa22fb112dd2561b5f5dec4', 'só é chamada pelo job novo'),
  ('expire_meeting_change_requests()',                                 '1ecc29bf9e6c343052200525f6ff9ad5', 'só é chamada pelo job novo'),
  ('expire_balance_meeting_requests()',                                '2cd45a5c9b7557854761b31f50f04420', 'só é chamada pelo job novo'))
select e.assinatura, e.papel, p.oid is not null as existe,
       md5(p.prosrc) = e.md5_esperado as igual,
       p.prosecdef as definer, p.proconfig::text as config
from esperado e
left join pg_proc p on p.pronamespace = 'public'::regnamespace and p.oid::regprocedure::text = e.assinatura
order by e.papel, e.assinatura;

-- D2 A assinatura LEGADA de 5 args (só existe neste projeto, não no repositório): a 20261116170000 a substitui com CREATE OR REPLACE,
--    que EXIGE os mesmos nomes de parâmetros e o mesmo retorno. ESPERADO: nomes_ok = true, retorno = uuid, defaults = 1.
select p.oid::regprocedure::text as assinatura,
       p.proargnames = array['p_beach_id','p_level','p_language','p_meetings','p_partner_code'] as nomes_ok,
       p.proargnames::text as nomes, pg_get_function_result(p.oid) as retorno, p.pronargdefaults as defaults, p.prosecdef as definer
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.oid::regprocedure::text = 'create_booking(uuid,lesson_level,text,jsonb,text)';

-- D3 Dependentes das duas assinaturas de create_booking (a 20261116160000 faz DROP ... RESTRICT da de 6 args). ESPERADO: 0 linhas.
--    Se houver linhas, o DROP falharia (e a transação desfaria tudo): resolva antes.
select d.classid::regclass as tipo_objeto, d.objid, d.deptype
from pg_depend d join pg_proc p on p.oid = d.refobjid
where p.pronamespace = 'public'::regnamespace and p.proname = 'create_booking' and d.deptype = 'n';

-- D4 Duplicatas inesperadas. ESPERADO: create_booking = 2; todas as outras = 1.
select proname, count(*) as assinaturas from pg_proc
where pronamespace = 'public'::regnamespace and proname in ('create_booking','accept_instructor_offer','request_meeting_change','respond_meeting_change','confirm_test_payment','advance_instructor_offer')
group by proname order by proname;

-- D5 Nomes que as migrations novas vão CRIAR não podem existir já (CREATE FUNCTION sem OR REPLACE falharia). ESPERADO: 0 linhas.
select proname from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('guard_student_meeting_overlap','guard_student_booking_activation','guard_student_meeting_overlap_for_activation','run_queue_expiry_job','run_expiry_jobs');

-- D6 TEXTO das funções que serão recriadas (preciso do texto para comparar com o repositório linha a linha; o md5 do D1 só diz "diferente").
--    Cole a saída COMPLETA na issue #88. Principalmente a de 6 args: ela está em estado intermediário (trava sem revalidação) e a 20261116160000
--    a substitui por inteiro; se houver QUALQUER ajuste manual além disso, ele seria perdido.
select p.oid::regprocedure::text as assinatura, pg_get_functiondef(p.oid) as definicao
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'create_booking' order by 1;
