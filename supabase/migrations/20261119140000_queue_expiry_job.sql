-- #92/#94: ponto único de EXECUÇÃO OFFLINE das expirações, dentro do banco, sem chave de serviço no app.
--
-- Problema: as expirações (oferta/pedido de instrutor, pedido de remarcação 12h + janela do aluno 12h, reatribuição, saldo 48h)
-- só rodam quando alguém as chama. O agendamento por pg_cron das migrations 20261102000030/31 e 20261105000038 só acontece se o
-- pg_cron JÁ existia quando a migration rodou; no Supabase real ele não existia, então nada expira com o navegador fechado.
-- O worker HTTP do app (/api/internal/queue-maintenance) só avança pedidos de instrutor e exigiria uma chave de serviço no app,
-- o que a regra do projeto proíbe. Esta função resolve a execução dentro do banco.
--
-- NÃO AGENDA NADA. A issue #92 manda não ativar agendador antes de revisar buscas/ofertas já vencidas. Para ativar em homologação,
-- veja docs/HOMOLOGACAO_FILA_92.md (cron.schedule manual). Sem agendar, esta migration só cria funções fechadas à API.
-- Aditiva: não toca em dados, preços ou pagamentos.
begin;

-- Avança, em lote e sem esperar por travas alheias, os pedidos de instrutor com algo vencido:
-- (a) a janela de busca do pedido terminou, ou (b) a oferta viva de algum instrutor venceu.
create function public.run_queue_expiry_job(p_limit integer default 50) returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid batch size' using errcode = '22023';
  end if;
  for r in
    select q.id from public.instructor_requests q
    where q.status = 'searching'
      and (q.expires_at <= now()
           or exists (select 1 from public.instructor_offers o
                      where o.request_id = q.id and o.status in ('offered', 'suggested') and o.expires_at <= now()))
    order by q.expires_at
    limit p_limit
    for update of q skip locked
  loop
    perform public.advance_instructor_offer(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Falhas devem chegar ao agendador como SQL ERROR: o pg_cron marca a execução como failed.
-- Todas as rotinas compartilham a mesma transação; qualquer erro reverte o lote inteiro,
-- evitando progresso parcial silencioso. NÃO agenda cron nem altera dados na instalação.
create function public.run_expiry_jobs() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_requests integer; v_changes integer; v_balance integer;
begin
  v_requests := public.run_queue_expiry_job();
  v_changes := public.expire_meeting_change_requests();
  v_balance := public.expire_balance_meeting_requests();
  return jsonb_build_object('instructor_requests', v_requests, 'meeting_changes', v_changes, 'balance_requests', v_balance);
end $$;

revoke all on function public.run_queue_expiry_job(integer) from public, anon, authenticated;
revoke all on function public.run_expiry_jobs() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
