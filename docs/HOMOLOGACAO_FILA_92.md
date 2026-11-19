# #92: executor offline da fila e ensaio de homologação (3 instrutores)

**Estado:** o ensaio abaixo foi **provado em banco descartável** (`scripts/test-offer-offline-executor.sh`, `89h_change_windows_and_incident.test.sql`),
com o job do banco chamado direto. **Não foi executado** no projeto de teste: o ambiente de automação não alcança `*.supabase.co`
(`curl: (56) CONNECT tunnel failed, response 403`) e não há agendador nem contas de teste disponíveis para quem escreveu isto.

## Por que um job dentro do banco
Hoje nada expira com o navegador fechado:
- as migrations `20261102000030/31` e `20261105000038` só agendam o `pg_cron` **se ele já existia** quando rodaram; no Supabase real ele não existia (issue #92);
- o worker HTTP `/api/internal/queue-maintenance` só avança pedidos de instrutor e exigiria `SUPABASE_SECRET_KEY` no app, o que a regra do projeto proíbe
  ("só `NEXT_PUBLIC_*`, o app não usa `service_role`").

A migration `20261119140000_queue_expiry_job.sql` cria duas funções **fechadas à API** (`anon` e `authenticated` não executam):
| Função | O que faz |
|---|---|
| `public.run_queue_expiry_job(p_limit int default 50)` | avança, em lote e com `skip locked`, os pedidos de instrutor com janela de busca vencida ou oferta viva vencida; devolve quantos avançou |
| `public.run_expiry_jobs()` | roda a anterior **e** `expire_meeting_change_requests()` e `expire_balance_meeting_requests()`; devolve `{"instructor_requests":n,"meeting_changes":n,"balance_requests":n}` (`-1` em uma chave = aquela rotina falhou, as outras seguem) |

A migration **não agenda nada** (a issue #92 manda não ativar agendador antes de revisar as buscas e ofertas já vencidas).

## Passo 0: antes de agendar, revisar o que já está vencido (somente leitura)
```sql
-- ESPERADO em homologação limpa: 0 linhas. Em produção, a issue #92 registrou 4 buscas e 3 ofertas vencidas: revise antes de ativar.
select q.id, q.status, q.expires_at from public.instructor_requests q where q.status = 'searching' and q.expires_at <= now();
select o.id, o.request_id, o.status, o.expires_at from public.instructor_offers o where o.status in ('offered','suggested') and o.expires_at <= now();
select id, status, expires_at from public.meeting_change_requests where status = 'pending' and expires_at <= now();
```

## Passo 1: habilitar o agendador no PROJETO DE TESTE (uma vez)
Painel > Database > Extensions > habilite `pg_cron` (ou `create extension if not exists pg_cron;`). Depois, no SQL Editor:
```sql
-- agenda a cada minuto; nome fixo para poder remover
select cron.schedule('vento-homologacao-expiry', '* * * * *', $$select public.run_expiry_jobs()$$);
-- conferir:
select jobid, jobname, schedule, active from cron.job where jobname = 'vento-homologacao-expiry';   -- ESPERADO: 1 linha, active = true
```
Para desligar ao terminar: `select cron.unschedule('vento-homologacao-expiry');`. **Não agende em produção** sem a revisão do Passo 0.
Observação: as migrations antigas podem já ter criado jobs `vento-meeting-change-expiry`/similares se o `pg_cron` existia; confira `select jobname from cron.job;` para não rodar duas vezes (o job é idempotente, mas duplicar só gera ruído).

## Passo 2: contas de teste (3 instrutores aprovados na mesma praia + 1 aluno)
Crie pelo painel Authentication (e-mails fictícios, e-mail confirmado): instrutores A, B, C e um aluno. Aprove os três instrutores (documentos de teste aprovados) com a mesma praia (ex.: Preá), idioma Português, agenda aberta no dia escolhido.
Anote os `id` (uuid) de A, B, C e do aluno.

## Passo 3: ensaio A → B → C com os NAVEGADORES FECHADOS
1. Com o app aberto, **o aluno cria o pedido** (fluxo "buscar instrutor") para um horário em que os três podem atender. Anote o `id` do pedido e feche **todos** os navegadores/abas (aluno, instrutores, admin).
2. Observe pelo SQL (somente leitura), a cada minuto:
```sql
select o.instructor_id, o.status, o.expires_at, o.responded_at
from public.instructor_offers o where o.request_id = '<ID_DO_PEDIDO>' order by o.created_at;
select status, booking_id, expires_at from public.instructor_requests where id = '<ID_DO_PEDIDO>';
select jobid, status, start_time, end_time, return_message from cron.job_run_details order by start_time desc limit 5;
```
3. **ESPERADO sem ninguém clicar:** a oferta de A passa a `expired` ~2 min depois de criada, a de B nasce `offered` (instrutor diferente), expira, a de C nasce; depois de C expirar, o pedido segue `searching` até o fim da janela de busca (6 min) e então vira `expired`. Nenhum instrutor aparece duas vezes e `booking_id` continua nulo.
4. Repita com um novo pedido: A expira (sem clicar), **B recusa pelo app**, **C aceita pelo app**. ESPERADO: pedido `accepted`, **uma** reserva (`select count(*) from bookings where id = '<booking_id>'` = 1), oferta de A `expired`, B `declined`, C `accepted`.
5. **Mesmo estado para os três perfis:** abra, em sessões separadas, Aluno (pedido/reserva), Instrutor C (aula) e Admin (pedido/ofertas) e confirme que mostram o mesmo estado e prazo. Capture as telas (sem dados pessoais).

## Passo 4: janelas de remarcação (12h + 12h) com o job
Para não esperar 24 horas reais, em **projeto de teste** antecipe os prazos por SQL e deixe o job agir:
```sql
update public.meeting_change_requests set expires_at = now() - interval '1 second' where id = '<ID_DO_PEDIDO_DE_REMARCACAO>';
-- espere o job (até 1 min): status = 'expired' e choice_expires_at ~ agora + 12h
update public.meeting_change_requests set choice_expires_at = now() - interval '1 second' where id = '<ID_DO_PEDIDO_DE_REMARCACAO>';
-- espere o job: resolution = 'replacement_requested'; a reserva fica sem instrutor até um substituto aceitar
```
ESPERADO: a reserva continua `confirmed`, mantém código, valores e data do encontro; o substituto que aceita assume a mesma reserva.

## Se algo falhar
Copie a mensagem exata do SQL ou do `cron.job_run_details.return_message`, **desligue o job** (`cron.unschedule`) e registre na issue #92. Não edite migration aplicada: crie a próxima.

## Limites
- Este roteiro prova o executor **dentro do banco**. O worker HTTP (`QUEUE_WORKER_ENABLED`) segue desativado e não é necessário para esta rota.
- O prazo real da oferta (2 min) e da busca (6 min) vem do banco; o ensaio acima usa esses prazos sem alterá-los (o Passo 4 só antecipa relógio em teste).
