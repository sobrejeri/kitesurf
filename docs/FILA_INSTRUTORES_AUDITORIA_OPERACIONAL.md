# Fila de instrutores — diagnóstico operacional (13/11/2026)

## Evidência em homologação
Consulta somente leitura no projeto Supabase VentoKite:
- 5 solicitações com `status='searching'` e `expires_at <= now()`;
- 4 ofertas com `status IN ('offered','suggested')` e `expires_at <= now()`;
- 0 solicitações `searching` ainda válidas sem oferta ativa.

A RPC `advance_instructor_offer(uuid)` existe e possui bloqueio de linha (`FOR UPDATE`), expiração e seleção do próximo instrutor. O EXECUTE não está liberado para `anon` nem `authenticated`. Não foi encontrada extensão `pg_cron` ou `pg_net`, nem worker VentoKite no workspace Render examinado. Isso **não descarta um agendador externo**, mas falta comprovação de execução sem sessão aberta.

## Consulta de diagnóstico (somente leitura)

```sql
select
  (select count(*) from public.instructor_requests
   where status = 'searching' and expires_at <= now()) as expired_requests,
  (select count(*) from public.instructor_offers
   where status in ('offered','suggested') and expires_at <= now()) as overdue_offers,
  (select count(*) from public.instructor_requests r
   where r.status = 'searching' and r.expires_at > now()
     and not exists (
       select 1 from public.instructor_offers o
       where o.request_id = r.id
         and o.status in ('offered','suggested')
         and o.expires_at > now()
     )) as active_requests_without_offer;
```

## Condições antes de ativar manutenção automática

1. Identificar o agendador real (ou implementar worker de backend), com segredo fora do cliente e permissão mínima; **não** conceder `EXECUTE` da função privilegiada ao público.
2. Revisar o contrato de `advance_instructor_offer`, inclusive estados terminais, concorrência e tratamento de solicitações antigas. Uma execução em lote deve ser limitada, auditável e idempotente.
3. Testar A→B→C com todos os navegadores fechados, expiração de ofertas, aceite simultâneo e indisponibilidade de instrutor.
4. Demonstrar que solicitações expiradas não viram reservas e que aulas existentes não são afetadas.
5. Registrar logs, métricas de atraso e recuperação de falhas; habilitar apenas após homologação.

**Nenhuma alteração de dados ou extensão foi executada nesta auditoria.** Checkout real permanece desligado.
