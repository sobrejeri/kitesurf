-- RECONCILIAÇÃO (23/11/2026, item 1): espelha o hotfix aplicado no Supabase Kitesurf com a versão 20261123114943
-- (security_fix_four_trigger_search_paths). NÃO reexecute onde já consta no ledger; idempotente para bancos isolados.
-- Efeito registrado: search_path fixo ('') nas 4 funções de trigger que o Security Advisor apontava como mutáveis. O ledger registra que a
-- primeira tentativa falhou por asserção de formatação e foi revertida; a segunda foi aplicada. Conferir `statements` antes de tratá-lo como idêntico.
BEGIN;
ALTER FUNCTION public.bookings_snapshot_frozen() SET search_path = '';
ALTER FUNCTION public.touch_updated_at() SET search_path = '';
ALTER FUNCTION public.reject_change() SET search_path = '';
ALTER FUNCTION public.reject_test_payment() SET search_path = '';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('bookings_snapshot_frozen', 'touch_updated_at', 'reject_change', 'reject_test_payment')
      AND NOT ('search_path=""' = ANY (coalesce(p.proconfig, ARRAY[]::text[])))) THEN
    RAISE EXCEPTION 'search_path was not fixed on all four trigger functions';
  END IF;
END $$;
COMMIT;
