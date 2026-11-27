-- #92 — SOMENTE LEITURA, só agregados (sem nomes, e-mails ou ids de pessoas). Explica por que uma solicitação pode não aparecer quando há um instrutor só.
-- Rodar no projeto de TESTE; devolver a saída. Não altera nada, não chama as funções da fila.

-- Q1 Elegíveis por praia (o que advance_instructor_offer exige antes de olhar agenda): aprovado + vinculado à praia. ESPERADO: pelo menos 1 por praia usada.
select b.slug as praia, count(*) filter (where i.status = 'approved') as aprovados, count(*) as vinculados,
       count(*) filter (where i.status = 'approved' and i.has_support_vehicle) as aprovados_com_veiculo
from public.beaches b left join public.instructor_beaches ib on ib.beach_id = b.id left join public.instructors i on i.id = ib.instructor_id
where b.active group by 1 order by 1;

-- Q2 Idiomas declarados pelos instrutores aprovados (a solicitação só chega se o idioma pedido estiver na lista, com a MESMA grafia).
select lang, count(*) as instrutores from (select unnest(languages) as lang from public.instructors where status = 'approved') x group by 1 order by 1;

-- Q3 Agenda salva (quem salvou limita os dias e horários; sem agenda salva não há restrição).
select count(*) filter (where s.instructor_id is not null) as com_agenda_salva, count(*) as aprovados
from public.instructors i left join public.instructor_schedule_settings s on s.instructor_id = i.id where i.status = 'approved';
select weekday, count(*) as instrutores, min(opens_at) as abre_min, max(closes_at) as fecha_max from public.instructor_weekly_hours group by 1 order by 1;

-- Q4 A política de leitura da solicitação pelo instrutor precisa ser a versão corrigida (migration 33): compara com a coluna da solicitação, não com o id da oferta.
-- ESPERADO: corrigida = true. Se false, o instrutor vê a oferta mas NÃO os detalhes da solicitação (a tela mostra "os detalhes não puderam ser carregados").
select policyname, (qual like '%offered.request_id = instructor_requests.id%' or regexp_replace(qual, '\s+', '', 'g') like '%request_id=instructor_requests.id%') as corrigida
from pg_policies where schemaname = 'public' and tablename = 'instructor_requests' and policyname = 'request_visible_to_participants';

-- Q5 O que aconteceu com as solicitações: estado final por solicitação e ofertas por situação (contagens).
select r.status as solicitacao, count(*) as total, count(*) filter (where not exists (select 1 from public.instructor_offers o where o.request_id = r.id)) as sem_nenhuma_oferta
from public.instructor_requests r group by 1 order by 1;
select o.status as oferta, count(*) as total, count(*) filter (where o.status = 'offered' and o.expires_at <= now()) as vencidas_ainda_offered,
       round(avg(extract(epoch from (coalesce(o.responded_at, o.expires_at) - o.created_at)))) as segundos_ate_resposta_ou_vencimento
from public.instructor_offers o group by 1 order by 1;
-- Q6 Solicitações que expiraram sem NENHUMA oferta (instrutor travado, ocupado, fora de agenda ou inelegível no instante da busca).
select count(*) as expiradas_sem_oferta from public.instructor_requests r
where r.status in ('expired') and not exists (select 1 from public.instructor_offers o where o.request_id = r.id);
