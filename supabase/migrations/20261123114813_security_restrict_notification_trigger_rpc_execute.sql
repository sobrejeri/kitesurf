-- RECONCILIAÇÃO (23/11/2026, item 1): espelha o hotfix aplicado no Supabase Kitesurf com a versão 20261123114813
-- (security_restrict_notification_trigger_rpc_execute). NÃO reexecute onde já consta no ledger; idempotente para bancos isolados.
-- Efeito registrado: EXECUTE revogado de PUBLIC/anon/authenticated nas 4 funções de TRIGGER de notificação. Os gatilhos continuam
-- disparando (o privilégio EXECUTE só é checado ao criar o gatilho, não quando ele dispara); o que se fecha é a chamada direta como RPC.
-- Reconstruído da descrição em #105; conferir com `statements` do ledger antes de tratá-lo como idêntico.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.notify_booking_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_confirmed_booking() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_lesson_incident() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_offer_transition() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
